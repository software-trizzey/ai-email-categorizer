import { complete, getModel, Context, ProviderStreamOptions } from "@earendil-works/pi-ai";
import {
    findServiceType,
    ServiceType,
    ServiceTypeId,
} from "./service-types";
import {
    categorizerOpenAiResponsesFormat,
    createSafeCategorizerOutput,
    validateCategorizerOutput,
    type CategorizerOutput,
} from "./categorizer-contract";
import {
    buildCategorizerUserPrompt,
    CATEGORIZER_SYSTEM_PROMPT,
} from "./categorizer-prompt";
import { logError, logInfo, logWarn } from "../utils/logger";

export {
    buildCategorizerUserPrompt,
    buildCategorizerUserPrompt as buildQuoteCheckPrompt,
    CATEGORIZER_SYSTEM_PROMPT,
} from "./categorizer-prompt";

export interface IncomingEmailData {
    subject: string;
    body: string;
    metadata?: unknown; // TODO: store this data as is
}

export interface CategorizerModelOptions {
    provider?: string;
    model?: string;
    apiKey?: string;
    temperature?: number;
}

const SAFE_CATEGORIZER_ALERT_REASON = "Categorizer response could not be parsed or validated; no admin alert sent.";

export type CategorizationResult = CategorizerOutput & {
    serviceTypeId: ServiceTypeId;
    serviceType: ServiceType;
};

class CategorizerParseError extends Error {
    constructor(message: string, public details: Record<string, unknown>) {
        super(message);
        this.name = "CategorizerParseError";
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCategorizerResponse(text: string): CategorizationResult {
    const normalizedText = normalizeJsonResponse(text);
    const parsed: unknown = JSON.parse(normalizedText);

    if (!isRecord(parsed)) {
        throw new CategorizerParseError("Categorizer response was not a JSON object", { parsed });
    }

    return toCategorizationResult(validateCategorizerOutput(parsed));
}

function toCategorizationResult(output: CategorizerOutput): CategorizationResult {
    const serviceType = findServiceType(output.serviceTypeId);

    if (!serviceType) {
        throw new CategorizerParseError("Categorizer response included an unknown service type", { output });
    }

    return {
        ...output,
        serviceTypeId: serviceType.id,
        serviceType,
    };
}

function createSafeCategorizationResult(alertReason = SAFE_CATEGORIZER_ALERT_REASON): CategorizationResult {
    return toCategorizationResult(createSafeCategorizerOutput(alertReason));
}

function normalizeJsonResponse(text: string): string {
    const trimmedText = text.trim();
    const withoutFence = trimmedText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

    if (withoutFence.startsWith("{") && withoutFence.endsWith("}")) {
        return withoutFence;
    }

    const jsonStartIndex = withoutFence.indexOf("{");
    const jsonEndIndex = withoutFence.lastIndexOf("}");

    if (jsonStartIndex !== -1 && jsonEndIndex > jsonStartIndex) {
        return withoutFence.slice(jsonStartIndex, jsonEndIndex + 1);
    }

    return withoutFence;
}

function withCategorizerJsonSchema(payload: unknown): unknown {
    if (!isRecord(payload)) return payload;

    return {
        ...payload,
        text: {
            ...(isRecord(payload.text) ? payload.text : {}),
            format: categorizerOpenAiResponsesFormat,
        },
    };
}

function getDefaultApiKey(provider: string): string | undefined {
    switch (provider) {
        case "anthropic": return process.env.ANTHROPIC_API_KEY;
        case "google": return process.env.GEMINI_API_KEY;
        case "openai":
        default: return process.env.OPENAI_API_KEY;
    }
}

export async function categorizeEmail(
    email: IncomingEmailData,
    options: CategorizerModelOptions = {},
): Promise<CategorizationResult | null> {
    const provider = options.provider ?? process.env.CATEGORIZER_PROVIDER ?? "openai";
    const modelId = options.model ?? process.env.CATEGORIZER_MODEL ?? "gpt-4o-mini";
    const model = getModel(provider as never, modelId as never);
    let prompt = "";
    try {
        prompt = buildCategorizerUserPrompt(email.subject, email.body);
    } catch (error: unknown) {
        logError("Failed to build categorizer prompt", error);
        return null;
    }

    const context: Context = {
        systemPrompt: CATEGORIZER_SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
    };

    const requestOptions: ProviderStreamOptions = {
        apiKey: options.apiKey ?? getDefaultApiKey(provider),
        temperature: options.temperature ?? 0,
        onPayload: (payload, requestModel) => requestModel.api === "openai-responses"
            ? withCategorizerJsonSchema(payload)
            : payload,
    };

    const response = await complete(model, context, requestOptions);

    logInfo("Received categorizer model response", {
        model: response.model,
        provider: response.provider,
        stopReason: response.stopReason,
        usage: response.usage,
        contentBlockCount: response.content.length,
        errorMessage: response.errorMessage,
    });

    for (const block of response.content) {
        if (block.type !== "text") continue;

        try {
            const result = parseCategorizerResponse(block.text);
            logInfo("Parsed categorizer model response", { result });
            return result;
        } catch (error) {
            logError("Failed to parse categorizer response block", error, {
                rawResponse: block.text,
            });
        }
    }

    const alertReason = response.errorMessage
        ? `${SAFE_CATEGORIZER_ALERT_REASON} Model error: ${response.errorMessage}`
        : SAFE_CATEGORIZER_ALERT_REASON;

    logWarn("Categorizer response did not contain any parseable text blocks; returning safe non-alert result", {
        stopReason: response.stopReason,
        errorMessage: response.errorMessage,
        content: response.content,
        alertReason,
    });

    return createSafeCategorizationResult(alertReason);
}
