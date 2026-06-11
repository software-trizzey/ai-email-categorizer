import { complete, type Context } from "@earendil-works/pi-ai";

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

export interface IncomingEmailData {
    subject: string;
    body: string;
    metadata?: unknown; // TODO: store this data as is
}

export async function categorizeEmail(
    email: IncomingEmailData,
    options: CategorizerModelOptions = {},
): Promise<CategorizationResult | null> {
    const { provider, modelId, baseUrl, model } = resolveCategorizerModelConfig(options);

    if (!model) {
        logError("Failed to resolve categorizer model", new Error("Unknown categorizer model configuration"), {
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
        logError("Failed to build categorizer prompt", error);
        return null;
    }

    const context: Context = {
        systemPrompt: CATEGORIZER_SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
    };

    const response = await complete(model, context, buildCategorizerRequestOptions(options, provider));

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
