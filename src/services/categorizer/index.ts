import { complete, type AssistantMessage, type Context } from "@earendil-works/pi-ai";

import {
    recordCategorizerModelError,
    recordCategorizerModelResponse,
    recordCategorizerParsedResult,
    recordCategorizerParseError,
    recordCategorizerPromptError,
    withCategorizerRunSpan,
} from "../../observability/categorizer";
import { capturePostHogEvent } from "../../observability/posthog";
import { logError, logInfo, logWarn } from "../../utils/logger";
import {
    buildCategorizerRequestOptions,
    resolveCategorizerModelConfig,
    type CategorizerModelOptions,
} from "./model";
import {
    buildCategorizerUserPrompt,
    CATEGORIZER_SYSTEM_PROMPT,
} from "./prompt";
import {
    createSafeCategorizationResult,
    parseCategorizerResponse,
    SAFE_CATEGORIZER_ALERT_REASON,
    type CategorizationResult,
} from "./result";

export {
    buildCategorizerUserPrompt,
    buildCategorizerUserPrompt as buildQuoteCheckPrompt,
    CATEGORIZER_SYSTEM_PROMPT,
} from "./prompt";
export { CategorizerModelProvider } from "./model";
export type { CategorizerModelOptions } from "./model";
export type { CategorizationResult } from "./result";

export const CategorizerTrafficSource = {
    EvalEndpoint: "eval_endpoint",
    InboundEmail: "inbound_email",
} as const;

export type CategorizerTrafficSource = typeof CategorizerTrafficSource[keyof typeof CategorizerTrafficSource];

export type CategorizerMetadata = Record<string, unknown> & {
    source?: CategorizerTrafficSource;
};

export interface IncomingEmailData {
    subject: string;
    body: string;
    metadata?: CategorizerMetadata;
}

export async function categorizeEmail(
    email: IncomingEmailData,
    options: CategorizerModelOptions = {},
): Promise<CategorizationResult | null> {
    const { provider, modelId, baseUrl, model } = resolveCategorizerModelConfig(options);

    return withCategorizerRunSpan({
        source: getCategorizerMetadataSource(email.metadata),
        provider,
        requestedModel: modelId,
        baseUrl,
        subject: email.subject,
        body: email.body,
    }, async (span) => {
        if (!model) {
            const error = new Error("Unknown categorizer model configuration");
            recordCategorizerModelError(span, error);
            logError("Failed to resolve categorizer model", error, {
                provider,
                modelId,
                baseUrl,
            });
            return null;
        }

        let prompt = "";
        try {
            prompt = buildCategorizerUserPrompt(email.subject, email.body);
        } catch (error: unknown) {
            recordCategorizerPromptError(span, error);
            logError("Failed to build categorizer prompt", error);
            return null;
        }

        const context: Context = {
            systemPrompt: CATEGORIZER_SYSTEM_PROMPT,
            messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
        };

        let response: AssistantMessage;
        try {
            response = await complete(model, context, buildCategorizerRequestOptions(options, provider));
        } catch (error: unknown) {
            recordCategorizerModelError(span, error);
            throw error;
        }

        recordCategorizerModelResponse(span, response);

        logInfo("Received categorizer model response", {
            model: response.model,
            provider: response.provider,
            stopReason: response.stopReason,
            usage: response.usage,
            contentBlockCount: response.content.length,
            errorMessage: response.errorMessage,
        });

        for (const [blockIndex, block] of response.content.entries()) {
            if (block.type !== "text") continue;

            try {
                const result = parseCategorizerResponse(block.text);
                recordCategorizerParsedResult(span, result);
                logInfo("Parsed categorizer model response", { result });
                return result;
            } catch (error) {
                recordCategorizerParseError(span, error);
                logError("Failed to parse categorizer response block", error, {
                    blockIndex,
                    textLength: block.text.length,
                });
            }
        }

        const alertReason = response.errorMessage
            ? `${SAFE_CATEGORIZER_ALERT_REASON} Model error: ${response.errorMessage}`
            : SAFE_CATEGORIZER_ALERT_REASON;
        const safeResult = createSafeCategorizationResult(alertReason);
        span.setAttribute("categorizer.result.fallback", true);
        recordCategorizerParsedResult(span, safeResult);

        logWarn("Categorizer response did not contain any parseable text blocks; returning safe non-alert result", {
            stopReason: response.stopReason,
            errorMessage: response.errorMessage,
            contentBlockCount: response.content.length,
            alertReason,
        });

        capturePostHogEvent({
            distinctId: 'ai-email-categorizer',
            event: 'categorizer_fallback_result',
            properties: {
                provider,
                model_id: modelId,
                stop_reason: response.stopReason,
                has_model_error: Boolean(response.errorMessage),
                source: getCategorizerMetadataSource(email.metadata) ?? 'unknown',
            },
        });

        return safeResult;
    });
}

function getCategorizerMetadataSource(metadata: CategorizerMetadata | undefined): CategorizerTrafficSource | undefined {
    return isCategorizerTrafficSource(metadata?.source) ? metadata.source : undefined;
}

function isCategorizerTrafficSource(value: unknown): value is CategorizerTrafficSource {
    return Object.values(CategorizerTrafficSource).includes(value as CategorizerTrafficSource);
}
