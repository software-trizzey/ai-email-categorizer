# TODO:

A simple "roadmap" of tasks and ideas I have for this project.


- [x] Add promptfoo with concise eval suite to confirm model behavior
- [x] Add OpenTelemetry for vendor neutral visibility into model usage. 
- [x] Setup local model (Ollama) and compare results against foundational providers using promptfoo
- [x] Deploy self-hosted model for end-to-end private

## OpenTelemetry implementation plan

Goal: add vendor-neutral visibility into the categorization feature and model behavior. Keep boundary around categorization and avoid collecting prompt text, email body, subject, raw model output, or PII.

- [x] Add minimal OpenTelemetry dependencies.
  - [x] Install `@opentelemetry/api`, `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/resources`, and `@opentelemetry/semantic-conventions`.
  - [x] Confirm the app still starts with `bun run dev` after install.

- [x] Add telemetry bootstrap module.
  - [x] Create `src/observability/tracing.ts`.
  - [x] Export `startTelemetry()` that only starts when `OTEL_ENABLED=true`.
  - [x] Configure service name, service version, and deployment environment through standard OTel/resource attributes.
  - [x] Use the standard OTLP HTTP trace exporter so local Jaeger, Honeycomb, Grafana, SigNoz, etc. can be configured with env vars.
  - [x] Add graceful SDK shutdown on `SIGTERM` and `SIGINT`.

- [x] Start telemetry once at app boot.
  - [x] Import and call `startTelemetry()` at the top of `src/index.ts`.
  - [x] Keep telemetry disabled by default for local development unless `OTEL_ENABLED=true` is set.

- [x] Add categorizer-specific tracing helpers.
  - [x] Create `src/observability/categorizer.ts`.
  - [x] Add a `categorizer.run` span helper with attributes for feature name, source, provider, requested model, safe base URL host, subject length, and body length.
  - [x] Add helpers to record model response metadata: provider, response model, stop reason, token usage, estimated cost, content block count, and model error flag.
  - [x] Add helpers to record parsed categorizer result: service type id, confidence score, should-alert decision, explanation length, and alert reason length.
  - [x] Add parse/model error helpers that record exceptions and mark the span as errored.

- [x] Instrument `categorizeEmail` only at the feature boundary.
  - [x] Start the `categorizer.run` span after resolving provider/model config.
  - [x] Record model response metadata immediately after the `complete(...)` call.
  - [x] Record parse success/failure while iterating text blocks.
  - [x] Record safe fallback results when the model response cannot be parsed.
  - [x] End the span in a `finally` block.
  - [x] Do not add prompt text, subject text, body text, raw response text, or alert explanations to span attributes/events.

- [x] Mark traffic source for useful filtering.
  - [x] Pass `metadata: { source: "eval_endpoint" }` from `/eval/categorize`.
  - [x] Pass `metadata: { source: "inbound_email" }` from `processInboundEmail`.
  - [x] Add a small helper to safely read `metadata.source` inside the categorizer.

- [x] Add environment docs.
  - [x] Update `.env.example` with `OTEL_ENABLED`, `OTEL_SERVICE_NAME`, and `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`.
  - [x] Update `README.md` with a short local Jaeger smoke-test flow.
  - [x] Add Render env var notes for enabling telemetry in production without code changes.

- [x] Verify locally.
  - [x] Start Jaeger locally with OTLP HTTP on port `4318`.
  - [x] Run the app with `OTEL_ENABLED=true`, `ENABLE_EVAL_ENDPOINTS=true`, and `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4318/v1/traces`.
  - [x] Run `bun run eval:categorizer:service -- --filter-first-n 1`.
  - [x] Confirm a trace appears for `ai-email-categorizer` with a `categorizer.run` span.
  - [x] Confirm span attributes show model/provider/tokens/result metadata but no PII or raw model text.
  - [x] Save local dashboard evidence at `assets/images/jaeger-ui-categorizer-demo.png`.

- [x] Keep the implementation intentionally small.
  - [x] Do not add broad HTTP auto-instrumentation in v1 unless it is needed later.
  - [x] Do not add a custom metrics pipeline in v1; derive latency from spans and rely on existing evals for quality gates.
  - [x] Do not store traces/results in the app database as part of this pass.

## evaluation suite

The goal is to ship a useful baseline quickly, then use real-world inbound emails and feedback to decide which eval investments are worth making next. The later tasks are intentionally preserved as potential production-hardening work and blog post material, not launch blockers.

### Ship-now eval baseline

Reviewed setup first: the app is a Bun + Hono TypeScript service at the repo root; production categorization lives in `src/services/categorizer.ts`; inbound admin alerts are sent from `src/services/inbound-email.ts`; Promptfoo evals live in `evals/` with direct-provider config in `promptfoo.yaml` and local-service config in `promptfoo.service.yaml`. The response contract and prompt text now come from shared TypeScript sources, with Promptfoo artifacts generated before direct-provider evals.

- [x] Create the shared categorizer contract.
  - [x] Add a single contract module, e.g. `src/services/categorizer-contract.ts`, that owns the output fields, Zod validation, and JSON schema/response-format shape.
  - [x] Include ship-now fields: `explanation`, `serviceTypeId`, `confidenceScore`, `shouldAlertAdmin`, and `alertReason`.
  - [x] Treat parser/validation failures as a safe non-alert result in caller-facing code.

- [x] Wire production to the shared contract.
  - [x] Replace the hard-coded OpenAI JSON schema in `categorizer.ts` with the shared response format.
  - [x] Update `parseCategorizerResponse` to validate against the shared contract and return the explicit alert fields.
  - [x] Update `processInboundEmail` to use `categorizationResult.shouldAlertAdmin === true` instead of deriving alerts from confidence/service type alone.

- [x] Wire Promptfoo to the same contract.
  - [x] Generate or source `evals/categorizer-response-format.json` from the shared contract so Promptfoo and production cannot silently diverge.
  - [x] Update shared prompt instructions/examples to require the explicit alert fields and generate `evals/categorizer.prompt.txt` from that source.
  - [x] Keep provider configs unchanged initially to avoid mixing contract work with model-selection work.

- [x] Evaluate the business decision directly.
  - [x] Add `expectedShouldNotify` to `evals/categorizer-tests.csv` for every case.
  - [x] Update `evals/assert-categorization.js` to assert `shouldAlertAdmin` equals `expectedShouldNotify` in addition to service type/confidence checks.
  - [x] Keep confidence assertions as supporting diagnostics, not the only notification proxy.

- [x] Add parser safety fixtures.
  - [x] Add Bun tests/fixtures for malformed JSON, partial JSON, invalid service IDs, missing `shouldAlertAdmin`, and contradictory model output.
  - [x] Verify parser errors are observable/logged, and no admin alert can be sent from malformed or invalid output.

- [x] Verify before checking off the ship-now baseline.
  - [x] From the repo root: run `bun test` for parser/contract fixtures.
  - [x] Run `bun run eval:categorizer -- --filter-first-n 3` while iterating, then the full direct-provider eval. The full suite now passes after the multi-service prompt clarification.
  - [x] Start `ENABLE_EVAL_ENDPOINTS=true bun run dev` and run a no-cache `bun run eval:categorizer:service -- --filter-first-n 1` smoke check to confirm the real service path matches the direct eval contract.

### Later, once real-world data shows what matters

- [ ] Split eval data into separate CSVs: `synthetic.csv` for generated coverage and `real-gold.csv` for real inbound emails.
- [ ] Add separate confidence fields for quote intent and service type classification, e.g. `quoteIntentConfidence` and `serviceTypeConfidence`.
- [ ] Update categorizer output/schema/parser to support separate quote intent and service type confidence scores.
- [ ] Rework the confidence gate so quote intent and service type confidence can be tuned independently.
- [ ] Update eval assertions to calculate notification eligibility from confidence thresholds and compare it to `expectedShouldNotify`.
- [ ] Add synthetic coverage for happy paths, hard negatives, ambiguous requests, unsupported quote requests, multi-service requests, messy forwarded emails, signatures, typos, and prompt injection attempts.
- [ ] Add unit tests for parsing malformed model responses, invalid service IDs, confidence normalization, and confidence gate behavior.
- [ ] Track eval results by bucket (`synthetic`, `real-gold`, `sad`, `ambiguous`, etc.) instead of relying only on overall pass rate.

### Provider/model comparison

- [x] Add more model selection options through config/env so production and evals can easily switch provider/model pairs.
- [x] Expand Promptfoo provider matrix with additional viable low-cost models, including local/Ollama once available.