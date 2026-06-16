import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

let nextCategorizerText = "";
let nextErrorMessage: string | undefined;
let capturedCompleteModel: Record<string, unknown> | undefined;
let capturedRequestOptions: Record<string, unknown> | undefined;
let capturedPayload: unknown;
let capturedGetModelCalls: [string, string][] = [];

mock.module("@earendil-works/pi-ai", () => ({
    getModel: (provider: string, modelId: string) => {
        capturedGetModelCalls.push([provider, modelId]);
        return {
            id: modelId,
            name: modelId,
            api: "openai-responses",
            provider,
            baseUrl: "https://api.openai.com/v1",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128000,
            maxTokens: 16384,
        };
    },
    complete: async (model: Record<string, unknown>, _context: unknown, options: Record<string, unknown> | undefined) => {
        capturedCompleteModel = model;
        capturedRequestOptions = options;
        capturedPayload = typeof options?.onPayload === "function"
            ? await options.onPayload({ model: model.id }, model)
            : undefined;

        return {
            model: "mock-model",
            provider: "mock-provider",
            stopReason: "stop",
            usage: undefined,
            content: [{ type: "text", text: nextCategorizerText }],
            errorMessage: nextErrorMessage,
        };
    },
}));

const { categorizeEmail, CategorizerModelProvider } = await import("./index");

const validActionableOutput = {
    explanation: "The sender is asking for a quote for stump grinding.",
    serviceTypeId: "stumpGrinding",
    confidenceScore: 0.92,
    shouldAlertAdmin: true,
    alertReason: "The sender requested an estimate for stump grinding, which is a listed service.",
};

const invalidCategorizerFixtures = [
    {
        name: "malformed JSON",
        output: "{not valid json",
    },
    {
        name: "partial JSON",
        output: JSON.stringify(validActionableOutput).slice(0, -12),
    },
    {
        name: "invalid service IDs",
        output: JSON.stringify({
            ...validActionableOutput,
            serviceTypeId: "lawnMowing",
        }),
    },
    {
        name: "missing shouldAlertAdmin",
        output: JSON.stringify({
            explanation: validActionableOutput.explanation,
            serviceTypeId: validActionableOutput.serviceTypeId,
            confidenceScore: validActionableOutput.confidenceScore,
            alertReason: validActionableOutput.alertReason,
        }),
    },
    {
        name: "contradictory model output",
        output: JSON.stringify({
            ...validActionableOutput,
            serviceTypeId: "unknown",
            confidenceScore: 0.95,
            shouldAlertAdmin: true,
            alertReason: "The model incorrectly wants to alert for an unknown service.",
        }),
    },
];

function restoreEnv(name: string, value: string | undefined): void {
    if (value === undefined) {
        delete process.env[name];
        return;
    }

    process.env[name] = value;
}

function silenceConsole() {
    const errorSpy = spyOn(console, "error").mockImplementation(() => undefined);
    const warnSpy = spyOn(console, "warn").mockImplementation(() => undefined);
    const logSpy = spyOn(console, "log").mockImplementation(() => undefined);

    return {
        errorSpy,
        warnSpy,
        restore: () => {
            errorSpy.mockRestore();
            warnSpy.mockRestore();
            logSpy.mockRestore();
        },
    };
}

beforeEach(() => {
    nextCategorizerText = JSON.stringify(validActionableOutput);
    nextErrorMessage = undefined;
    capturedCompleteModel = undefined;
    capturedRequestOptions = undefined;
    capturedPayload = undefined;
    capturedGetModelCalls = [];
});

describe("categorizeEmail parser safety", () => {
    test("builds an OpenAI-compatible self-hosted model for local Ollama", async () => {
        const { errorSpy, warnSpy, restore } = silenceConsole();

        try {
            const result = await categorizeEmail({
                subject: "Stump grinding quote",
                body: "Can you quote grinding one stump below grade?",
            }, {
                provider: CategorizerModelProvider.SelfHosted,
                model: "gemma4:e4b",
                baseUrl: "http://localhost:11434/v1",
                apiKey: "ollama",
            });

            expect(result?.serviceTypeId).toBe("stumpGrinding");
            expect(capturedGetModelCalls).toHaveLength(0);
            expect(capturedCompleteModel).toMatchObject({
                id: "gemma4:e4b",
                api: "openai-completions",
                provider: "self-hosted",
                baseUrl: "http://localhost:11434/v1",
            });
            expect(capturedRequestOptions?.apiKey).toBe("ollama");
            expect(capturedRequestOptions?.maxTokens).toBe(1200);
            expect(capturedPayload).toMatchObject({
                response_format: { type: "json_object" },
                think: false,
            });
            expect(errorSpy).not.toHaveBeenCalled();
            expect(warnSpy).not.toHaveBeenCalled();
        } finally {
            restore();
        }
    });

    test("uses the default self-hosted base URL when env overrides are blank", async () => {
        const originalCategorizerBaseUrl = process.env.CATEGORIZER_BASE_URL;
        const originalSelfHostedBaseUrl = process.env.SELF_HOSTED_MODEL_BASE_URL;
        const { errorSpy, warnSpy, restore } = silenceConsole();

        process.env.CATEGORIZER_BASE_URL = "";
        delete process.env.SELF_HOSTED_MODEL_BASE_URL;

        try {
            const result = await categorizeEmail({
                subject: "Stump grinding quote",
                body: "Can you quote grinding one stump below grade?",
            }, {
                provider: CategorizerModelProvider.SelfHosted,
                model: "gemma4:e4b",
                apiKey: "ollama",
            });

            expect(result?.serviceTypeId).toBe("stumpGrinding");
            expect(capturedCompleteModel?.baseUrl).toBe("http://localhost:11434/v1");
            expect(errorSpy).not.toHaveBeenCalled();
            expect(warnSpy).not.toHaveBeenCalled();
        } finally {
            restoreEnv("CATEGORIZER_BASE_URL", originalCategorizerBaseUrl);
            restoreEnv("SELF_HOSTED_MODEL_BASE_URL", originalSelfHostedBaseUrl);
            restore();
        }
    });

    test("returns actionable results for valid contract output", async () => {
        const { errorSpy, warnSpy, restore } = silenceConsole();

        try {
            const result = await categorizeEmail({
                subject: "Stump grinding quote",
                body: "Can you quote grinding one stump below grade?",
            });

            expect(result).toMatchObject({
                serviceTypeId: "stumpGrinding",
                confidenceScore: 0.92,
                shouldAlertAdmin: true,
            });
            expect(result?.serviceType.label).toBe("Stump grinding");
            expect(errorSpy).not.toHaveBeenCalled();
            expect(warnSpy).not.toHaveBeenCalled();
        } finally {
            restore();
        }
    });

    for (const fixture of invalidCategorizerFixtures) {
        test(`returns safe non-alert result and logs parser failure for ${fixture.name}`, async () => {
            nextCategorizerText = fixture.output;
            const { errorSpy, warnSpy, restore } = silenceConsole();

            try {
                const result = await categorizeEmail({
                    subject: "Stump grinding quote",
                    body: "Can you quote grinding one stump below grade?",
                });

                expect(result).toMatchObject({
                    serviceTypeId: "unknown",
                    confidenceScore: 0,
                    shouldAlertAdmin: false,
                });
                expect(result?.alertReason).toContain("no admin alert sent");
                expect(errorSpy).toHaveBeenCalled();
                expect(warnSpy).toHaveBeenCalled();

                const loggedErrors = errorSpy.mock.calls.map((call) => String(call[0])).join("\n");
                expect(loggedErrors).toContain("Failed to parse categorizer response block");
            } finally {
                restore();
            }
        });
    }
});
