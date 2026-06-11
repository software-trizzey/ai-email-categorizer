# TODO:

A simple "roadmap" of tasks and ideas I have for this project.


- [ ] Add promptfoo with concise eval suite to confirm model behavior
- [ ] Add OpenTelemetry for vendor neutral visibility into model usage. 
- [ ] Setup local model (Ollama) and compare results against foundational providers using promptfoo
- [ ] Deploy self-hosted model for end-to-end private

## evaluation suite

The goal is to ship a useful baseline quickly, then use real-world inbound emails and feedback to decide which eval investments are worth making next. The later tasks are intentionally preserved as potential production-hardening work and blog post material, not launch blockers.

### Ship-now eval baseline

- [ ] Add `expectedShouldNotify` to eval cases so we test the actual business decision, not just service type classification.
- [ ] Add explicit admin alert intent fields to the categorizer result, e.g. `shouldAlertAdmin` and `alertReason`, so notification decisions are not inferred only from `serviceTypeId`.
- [ ] Define one structured JSON response contract for production and evals.
- [ ] Reuse the same JSON schema/response format across the production categorizer and Promptfoo evals.
- [ ] Keep a tiny smoke eval set for fast checks during prompt/service changes.
- [ ] Add basic malformed/partial JSON response fixtures to verify parser errors are handled safely and do not trigger admin alerts.
- [ ] Start a real-world gold eval set with any available inbound emails, redacted before committing.

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