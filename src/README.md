To install dependencies:
```sh
bun install
```

To run:
```sh
bun run dev
```

open http://localhost:3000

To run categorizer model evals:
```sh
bun run eval:categorizer
bun run eval:categorizer:service
bun run eval:categorizer:view
```

For local service evals, start the app with `ENABLE_EVAL_ENDPOINTS=true bun run dev`, then run `bun run eval:categorizer:service`.

See `evals/README.md` for provider API keys and filtering examples.
