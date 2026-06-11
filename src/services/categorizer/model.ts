import { getModel, type Api, type Model, type ProviderStreamOptions } from "@earendil-works/pi-ai";

import { getOptionalEnv, parsePositiveInteger } from "../../utils/env";
import { isRecord } from "../../utils/object";
import { categorizerOpenAiResponsesFormat } from "./contract";

export const CategorizerModelProvider = {
    OpenAI: "openai",
    Anthropic: "anthropic",
    Google: "google",
    SelfHosted: "self-hosted",
} as const;

export type CategorizerModelProvider = typeof CategorizerModelProvider[keyof typeof CategorizerModelProvider];

export interface CategorizerModelOptions {
    provider?: string;
    model?: string;
    apiKey?: string;
    baseUrl?: string;
    temperature?: number;
    maxTokens?: number;
}

const DEFAULT_CATEGORIZER_PROVIDER: CategorizerModelProvider = CategorizerModelProvider.OpenAI;
const DEFAULT_CATEGORIZER_MODEL = "gpt-4o-mini";
const DEFAULT_SELF_HOSTED_MODEL = "gemma4:e4b";
const DEFAULT_SELF_HOSTED_BASE_URL = "http://localhost:11434/v1";
const DEFAULT_SELF_HOSTED_API_KEY = "ollama";
const DEFAULT_SELF_HOSTED_CONTEXT_WINDOW = 4096;
// Local Ollama's OpenAI-compatible endpoint may still emit Gemma reasoning tokens even with think:false.
const DEFAULT_SELF_HOSTED_MAX_TOKENS = 1200;

type ResolvedCategorizerModelConfig = {
    provider: string;
    modelId: string;
    baseUrl: string | undefined;
    model: Model<Api> | null;
};

export function resolveCategorizerModelConfig(options: CategorizerModelOptions = {}): ResolvedCategorizerModelConfig {
    const provider = options.provider ?? getOptionalEnv("CATEGORIZER_PROVIDER") ?? DEFAULT_CATEGORIZER_PROVIDER;
    const modelId = options.model ?? getOptionalEnv("CATEGORIZER_MODEL") ?? getDefaultModelId(provider);
    const baseUrl = options.baseUrl ?? getDefaultBaseUrl(provider);
    const model = resolveCategorizerModel(provider, modelId, baseUrl, options.maxTokens);

    return { provider, modelId, baseUrl, model };
}

export function buildCategorizerRequestOptions(
    options: CategorizerModelOptions,
    provider: string,
): ProviderStreamOptions {
    const maxTokens = resolveConfiguredMaxTokens(options.maxTokens);

    return {
        apiKey: options.apiKey ?? getDefaultApiKey(provider),
        temperature: options.temperature ?? 0,
        maxTokens: provider === CategorizerModelProvider.SelfHosted
            ? maxTokens ?? DEFAULT_SELF_HOSTED_MAX_TOKENS
            : maxTokens,
        onPayload: (payload, requestModel) => {
            if (requestModel.api === "openai-responses") {
                return withCategorizerJsonSchema(payload);
            }

            if (isSelfHostedModel(requestModel)) {
                return withSelfHostedJsonMode(payload);
            }

            return payload;
        },
    };
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

function withSelfHostedJsonMode(payload: unknown): unknown {
    if (!isRecord(payload)) return payload;

    return {
        ...payload,
        response_format: { type: "json_object" },
        think: false,
    };
}

function getDefaultModelId(provider: string): string {
    return provider === CategorizerModelProvider.SelfHosted
        ? DEFAULT_SELF_HOSTED_MODEL
        : DEFAULT_CATEGORIZER_MODEL;
}

function getDefaultBaseUrl(provider: string): string | undefined {
    if (provider === CategorizerModelProvider.SelfHosted) {
        return getOptionalEnv("CATEGORIZER_BASE_URL")
            ?? getOptionalEnv("SELF_HOSTED_MODEL_BASE_URL")
            ?? DEFAULT_SELF_HOSTED_BASE_URL;
    }

    return getOptionalEnv("CATEGORIZER_BASE_URL");
}

function getDefaultApiKey(provider: string): string | undefined {
    const categorizerApiKey = getOptionalEnv("CATEGORIZER_API_KEY");
    if (categorizerApiKey) return categorizerApiKey;

    switch (provider) {
        case CategorizerModelProvider.Anthropic: return getOptionalEnv("ANTHROPIC_API_KEY");
        case CategorizerModelProvider.Google: return getOptionalEnv("GEMINI_API_KEY");
        case CategorizerModelProvider.SelfHosted: return getOptionalEnv("SELF_HOSTED_MODEL_API_KEY") ?? DEFAULT_SELF_HOSTED_API_KEY;
        case CategorizerModelProvider.OpenAI:
        default: return getOptionalEnv("OPENAI_API_KEY");
    }
}

function applyBaseUrlOverride<TApi extends Api>(model: Model<TApi>, baseUrl: string | undefined): Model<TApi> {
    return baseUrl ? { ...model, baseUrl } : model;
}

function resolveConfiguredMaxTokens(override?: number): number | undefined {
    return override ?? parsePositiveInteger(getOptionalEnv("CATEGORIZER_MAX_TOKENS"));
}

function resolveSelfHostedMaxTokens(override?: number): number {
    return resolveConfiguredMaxTokens(override) ?? DEFAULT_SELF_HOSTED_MAX_TOKENS;
}

function getSelfHostedContextWindow(): number {
    return parsePositiveInteger(getOptionalEnv("CATEGORIZER_CONTEXT_WINDOW")) ?? DEFAULT_SELF_HOSTED_CONTEXT_WINDOW;
}

function createSelfHostedModel(modelId: string, baseUrl: string, maxTokens: number): Model<"openai-completions"> {
    return {
        id: modelId,
        name: modelId,
        api: "openai-completions",
        provider: CategorizerModelProvider.SelfHosted,
        baseUrl,
        reasoning: false,
        input: ["text"],
        cost: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
        },
        contextWindow: getSelfHostedContextWindow(),
        maxTokens,
        compat: {
            supportsStore: false,
            supportsDeveloperRole: false,
            supportsReasoningEffort: false,
            supportsUsageInStreaming: false,
            maxTokensField: "max_tokens",
            supportsStrictMode: false,
            supportsLongCacheRetention: false,
        },
    };
}

function resolveCategorizerModel(
    provider: string,
    modelId: string,
    baseUrl: string | undefined,
    maxTokensOverride?: number,
): Model<Api> | null {
    if (provider === CategorizerModelProvider.SelfHosted) {
        if (!baseUrl) return null;
        return createSelfHostedModel(modelId, baseUrl, resolveSelfHostedMaxTokens(maxTokensOverride));
    }

    const model = getModel(provider as never, modelId as never) as Model<Api> | undefined;
    return model ? applyBaseUrlOverride(model, baseUrl) : null;
}

function isSelfHostedModel(model: Model<Api>): boolean {
    return model.provider === CategorizerModelProvider.SelfHosted;
}
