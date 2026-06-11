import { existsSync } from "node:fs";

const requiredAssets = [
    "evals/categorizer.prompt.txt",
    "evals/categorizer-response-format.json",
];

const missingAssets = requiredAssets.filter((path) => !existsSync(new URL(`../${path}`, import.meta.url)));

if (missingAssets.length > 0) {
    console.error([
        "Missing generated categorizer eval assets:",
        ...missingAssets.map((path) => `  - ${path}`),
        "",
        "Run `bun run generate:categorizer-eval-assets` before running Promptfoo directly.",
        "Tip: `bun run eval:categorizer` generates these files automatically before starting the eval.",
    ].join("\n"));
    process.exit(1);
}
