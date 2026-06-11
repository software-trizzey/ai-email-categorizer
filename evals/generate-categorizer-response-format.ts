import { writeFileSync } from "node:fs";

import { categorizerPromptfooResponseFormat } from "../src/services/categorizer-contract";

const outputPath = new URL("./categorizer-response-format.json", import.meta.url);

writeFileSync(outputPath, `${JSON.stringify(categorizerPromptfooResponseFormat, null, 2)}\n`);
