import { JSON5 } from "bun";
import { complete, getModel, Context, ProviderStreamOptions } from "@earendil-works/pi-ai";
import {
    findServiceType,
    ServiceType,
    ServiceTypeId,
    serviceTypePromptOptions,
    UNKNOWN_SERVICE_TYPE_ID,
} from "./service-types";
import { logError, logInfo, logWarn } from "../utils/logger";

interface IncomingEmailData {
    subject: string;
    body: string;
    metadata?: unknown; // TODO: store this data as is
}

export interface CategorizationResult {
    description: string;
    serviceTypeId: ServiceTypeId;
    serviceType: ServiceType;
    confidenceScore: number;
}

class CategorizerParseError extends Error {
    constructor(message: string, public details: Record<string, unknown>) {
        super(message);
        this.name = "CategorizerParseError";
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function parseCategorizerResponse(text: string): CategorizationResult {
    const normalizedText = normalizeJsonResponse(text);
    const parsed: unknown = JSON5.parse(normalizedText);

    if (!isRecord(parsed)) {
        throw new CategorizerParseError("Categorizer response was not a JSON object", { parsed });
    }

    const explanation = getStringValue(parsed, ["explanation", "description", "reason"]);
    const confidenceScore = normalizeConfidenceScore(parsed.confidenceScore ?? parsed.confidence ?? parsed.score);
    const serviceType = findServiceType(parsed.serviceTypeId ?? parsed.serviceType ?? parsed.requestedService);

    if (!explanation) {
        throw new CategorizerParseError("Categorizer response did not include an explanation", { parsed });
    }

    if (confidenceScore === null) {
        throw new CategorizerParseError("Categorizer response did not include a valid confidence score", { parsed });
    }

    if (!serviceType) {
        throw new CategorizerParseError("Categorizer response did not include a valid service type", { parsed });
    }

    return {
        description: explanation,
        serviceTypeId: serviceType.id,
        serviceType,
        confidenceScore,
    };
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

function getStringValue(record: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
        const value = record[key];

        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    }

    return null;
}

function normalizeConfidenceScore(value: unknown): number | null {
    const numericValue = typeof value === "number"
        ? value
        : typeof value === "string"
            ? Number(value.replace("%", "").trim())
            : NaN;

    if (!Number.isFinite(numericValue)) return null;

    if (numericValue >= 0 && numericValue <= 1) {
        return numericValue;
    }

    if (numericValue > 1 && numericValue <= 100) {
        return numericValue / 100;
    }

    return null;
}

function withCategorizerJsonSchema(payload: unknown): unknown {
    if (!isRecord(payload)) return payload;

    return {
        ...payload,
        text: {
            ...(isRecord(payload.text) ? payload.text : {}),
            format: {
                type: "json_schema",
                name: "email_categorization",
                strict: true,
                schema: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        explanation: { type: "string" },
                        serviceTypeId: {
                            type: "string",
                            enum: serviceTypePromptOptions.map(({ id }) => id),
                        },
                        confidenceScore: {
                            type: "number",
                            minimum: 0,
                            maximum: 1,
                        },
                    },
                    required: ["explanation", "serviceTypeId", "confidenceScore"],
                },
            },
        },
    };
}

function buildQuoteCheckPrompt(subject: string, body: string): string {
    if (!subject || !body) throw new Error("Invalid input detected. Please provide an email subject and body");

    return `
        Determine if the provided email is asking for a quote/estimate from the business based on the subject and body contents.
        For valid requests, infer the most likely service type from the serviceTypes list below.
        The serviceTypeId field must be exactly one of the ids from serviceTypes. Use "${UNKNOWN_SERVICE_TYPE_ID}" if the requested service is unclear or does not match the list.
        The confidenceScore field must be a number between 0 and 1.

        serviceTypes:
        ${JSON.stringify(serviceTypePromptOptions, null, 2)}

        Return only valid JSON. Do not include markdown, comments, or explanatory text outside the JSON.

        Expected response format:
        {
            "explanation": "The sender is asking the business for a quote.",
            "serviceTypeId": "stumpGrinding",
            "confidenceScore": 0.7
        }

        Input:
        Subject: ${subject}
        Email Body: ${body}
    `;
}

export async function categorizeEmail(email: IncomingEmailData): Promise<CategorizationResult | null> {
    const model = getModel("openai", "gpt-4o-mini");
    let prompt = "";
    try {
        prompt = buildQuoteCheckPrompt(email.subject, email.body);
    } catch (error: unknown) {
        logError("Failed to build categorizer prompt", error);
        return null;
    }

    const context: Context = {
        systemPrompt: "You are an email categorization specialist that reviews inbound emails and determines their intent.",
        messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
    };

    const requestOptions: ProviderStreamOptions = {
        apiKey: process.env.OPENAI_API_KEY,
        temperature: 0,
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

    logWarn("Categorizer response did not contain any parseable text blocks", {
        stopReason: response.stopReason,
        errorMessage: response.errorMessage,
        content: response.content,
    });

    throw new Error(response.errorMessage
        ? `There was a problem parsing categorization results: ${response.errorMessage}`
        : "There was a problem parsing categorization results");
}
