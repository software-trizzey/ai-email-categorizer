# TODO:

A simple "roadmap" of tasks and ideas I have for this project.


- [ ] Add promptfoo with concise eval suite to confirm model behavior
- [ ] Add OpenTelemetry for vendor neutral visibility into model usage. 
- [ ] Setup local model (Ollama) and compare results against foundational providers using promptfoo
- [ ] Deploy self-hosted model for end-to-end private

## evaluation suite

The goal is to ship a useful baseline quickly, then use real-world inbound emails and feedback to decide which eval investments are worth making next. The later tasks are intentionally preserved as potential production-hardening work and blog post material, not launch blockers.

### Ship-now eval baseline

Reviewed setup first: the app is a Bun + Hono TypeScript service under `src/`; production categorization lives in `src/src/services/categorizer.ts`; inbound admin alerts are sent from `src/src/services/inbound-email.ts`; Promptfoo evals live in `src/evals/` with direct-provider config in `src/promptfoo.yaml` and local-service config in `src/promptfoo.service.yaml`. The response contract and prompt text now come from shared TypeScript sources, with Promptfoo artifacts generated before direct-provider evals.

- [x] Create the shared categorizer contract.
  - [x] Add a single contract module, e.g. `src/src/services/categorizer-contract.ts`, that owns the output fields, Zod validation, and JSON schema/response-format shape.
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
  - [x] From `src/`: run `bun test` for parser/contract fixtures.
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

- [ ] Add more model selection options through config/env so production and evals can easily switch provider/model pairs.
- [ ] Expand Promptfoo provider matrix with additional viable low-cost models, including local/Ollama once available.