type PromptfooOptions = {
    config?: {
        url?: string;
    };
};

type PromptfooContext = {
    vars?: Record<string, unknown>;
};

function parseJsonArg<T>(index: number, fallback: T): T {
    const value = process.argv[index];
    if (!value) return fallback;

    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

function getString(value: unknown): string {
    return typeof value === "string" ? value : "";
}

async function main() {
    const options = parseJsonArg<PromptfooOptions>(3, {});
    const context = parseJsonArg<PromptfooContext>(4, {});
    const vars = context.vars ?? {};
    const subject = getString(vars.subject);
    const body = getString(vars.body);
    const url = process.env.CATEGORIZER_EVAL_URL || options.config?.url || "http://localhost:3000/eval/categorize";

    if (!subject || !body) {
        throw new Error("Missing Promptfoo vars.subject or vars.body");
    }

    const response = await fetch(url, {
        method: "POST",
        body: JSON.stringify({ subject, body }),
        headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Categorizer service failed: ${response.status} ${errorBody}`);
    }

    const payload = await response.json() as Record<string, unknown>;
    process.stdout.write(JSON.stringify(payload.result ?? payload.data ?? payload));
}

main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exit(1);
});
