import { describe, expect, test } from "bun:test";

import {
    buildCategorizerUserPrompt,
    buildPromptfooCategorizerPrompt,
    CATEGORIZER_SYSTEM_PROMPT,
} from "./categorizer-prompt";

describe("categorizer prompt", () => {
    test("builds production user prompt from dynamic email data", () => {
        const prompt = buildCategorizerUserPrompt("Quote request", "Can you quote stump grinding?");

        expect(prompt).toContain("Subject: Quote request");
        expect(prompt).toContain("Email Body: Can you quote stump grinding?");
        expect(prompt).not.toContain(CATEGORIZER_SYSTEM_PROMPT);
    });

    test("builds Promptfoo prompt with template variables", () => {
        const prompt = buildPromptfooCategorizerPrompt();

        expect(prompt).toContain(CATEGORIZER_SYSTEM_PROMPT);
        expect(prompt).toContain("Subject: {{subject}}");
        expect(prompt).toContain("Email Body: {{body}}");
    });
});
