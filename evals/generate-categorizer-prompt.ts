import { writeFileSync } from "node:fs";

import { buildPromptfooCategorizerPrompt } from "../src/services/categorizer-prompt";

const outputPath = new URL("./categorizer.prompt.txt", import.meta.url);

writeFileSync(outputPath, buildPromptfooCategorizerPrompt());
