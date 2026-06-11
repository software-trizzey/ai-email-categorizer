import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

let nextCategorizerText = "";
let nextErrorMessage: string | undefined;

mock.module("@earendil-works/pi-ai", () => ({
    getModel: () => ({ api: "openai-responses" }),
    complete: async () => ({
        model: "mock-model",
        provider: "mock-provider",
        stopReason: "stop",
        usage: undefined,
        content: [{ type: "text", text: nextCategorizerText }],
        errorMessage: nextErrorMessage,
    }),
}));

const { categorizeEmail } = await import("./categorizer");

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

beforeEach(() => {
    nextCategorizerText = JSON.stringify(validActionableOutput);
    nextErrorMessage = undefined;
});

describe("categorizeEmail parser safety", () => {
    test("returns actionable results for valid contract output", async () => {
        const errorSpy = spyOn(console, "error").mockImplementation(() => undefined);
        const warnSpy = spyOn(console, "warn").mockImplementation(() => undefined);
        const logSpy = spyOn(console, "log").mockImplementation(() => undefined);

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
            errorSpy.mockRestore();
            warnSpy.mockRestore();
            logSpy.mockRestore();
        }
    });

    for (const fixture of invalidCategorizerFixtures) {
        test(`returns safe non-alert result and logs parser failure for ${fixture.name}`, async () => {
            nextCategorizerText = fixture.output;
            const errorSpy = spyOn(console, "error").mockImplementation(() => undefined);
            const warnSpy = spyOn(console, "warn").mockImplementation(() => undefined);
            const logSpy = spyOn(console, "log").mockImplementation(() => undefined);

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
                errorSpy.mockRestore();
                warnSpy.mockRestore();
                logSpy.mockRestore();
            }
        });
    }
});
