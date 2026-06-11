# Categorizer evals

Suite checks the email categorization prompt against a small mix of happy, sad, and real-world paths. It also compares model cost and accuracy across OpenAI mini/nano, Anthropic Haiku, and Gemini Flash/Flash-Lite providers.

## Setup

Set the provider keys you want to test:

```sh
export OPENAI_API_KEY=...
export ANTHROPIC_API_KEY=...
export GEMINI_API_KEY=...
```

## Run

From the repo root:

```sh
# Direct model/provider comparison; regenerates ignored Promptfoo assets first
bun run eval:categorizer

# If running Promptfoo directly, generate the ignored prompt/response-format assets first
bun run generate:categorizer-eval-assets
bun run eval:categorizer:promptfoo

# Real service check against http://localhost:3000/eval/categorize
ENABLE_EVAL_ENDPOINTS=true bun run dev
bun run eval:categorizer:service

bun run eval:categorizer:view
```

Useful filters while iterating:

```sh
# One representative from each provider family
bun run eval:categorizer -- --filter-providers 'gpt-5-nano|claude-haiku-4-5|gemini-2.5-flash-lite'

# First three cases only
bun run eval:categorizer -- --filter-first-n 3
```

Use the Promptfoo table/viewer to compare pass rate and token/cost metrics. A good production candidate should pass the sad-path non-quote cases as well as the obvious quote requests.

`eval:categorizer` calls providers directly from Promptfoo and is best for model/provider selection. It regenerates `evals/categorizer.prompt.txt` and `evals/categorizer-response-format.json` from the shared TypeScript sources before running; those generated files are gitignored to avoid confusion. `eval:categorizer:promptfoo` skips generation and will print a descriptive error if those assets are missing. `eval:categorizer:service` calls the local running service at `http://localhost:3000/eval/categorize` and is best for checking that the service code, prompt construction, parsing, and confidence gate still work together.
