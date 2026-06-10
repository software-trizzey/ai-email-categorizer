# TODO:

A simple "roadmap" of tasks and ideas I have for this project.


- [ ] Add promptfoo with concise eval suite to confirm model behavior
- [ ] Add OpenTelemetry for vendor neutral visibility into model usage. 
- [ ] Setup local model (Ollama) and compare results against foundational providers using promptfoo
- [ ] Deploy self-hosted model for end-to-end private

## evaluation suite

### 1. Structured output contract and schema reuse

- [ ] Define one strict structured JSON response contract for production and evals, including required fields, enums, confidence ranges, and no additional properties.
- [ ] Reuse the same JSON schema/response format across the production categorizer, Promptfoo model evals, and local service evals to avoid drift.
- [ ] Update categorizer output/schema/parser to support separate quote intent and service type confidence scores.

### 2. Confidence scoring and notification gating

- [ ] Add separate confidence fields for quote intent and service type classification, e.g. `quoteIntentConfidence` and `serviceTypeConfidence`.
- [ ] Rework the confidence gate so quote intent and service type confidence can be tuned independently.
- [ ] Update inbound email processing to use the explicit admin alert intent plus confidence thresholds before sending notifications.

### 3. Expected outcomes and business decision coverage

- [ ] Add `expectedShouldNotify` to eval cases so we test the actual business decision, not just service type classification.
- [ ] Add explicit admin alert intent fields to the categorizer result, e.g. `shouldAlertAdmin` and `alertReason`, so notification decisions are not inferred only from `serviceTypeId`.
- [ ] Update eval assertions to calculate notification eligibility from confidence thresholds and compare it to `expectedShouldNotify`.

### 4. Eval data organization

- [ ] Split eval data into separate CSVs: `synthetic.csv` for generated coverage and `real-gold.csv` for real inbound emails.
- [ ] Keep a tiny smoke eval set for fast checks during prompt/service changes.
- [ ] Start a real-world gold eval set with any available inbound emails, redacted before committing.

### 5. Eval coverage scenarios

- [ ] Add synthetic coverage for happy paths, hard negatives, ambiguous requests, unsupported quote requests, multi-service requests, messy forwarded emails, signatures, typos, and prompt injection attempts.

### 6. Parser safety and failure handling

- [ ] Add malformed/partial JSON response fixtures to verify parser errors are handled safely and do not trigger admin alerts.
- [ ] Add unit tests for parsing malformed model responses, invalid service IDs, confidence normalization, and confidence gate behavior.

### 7. Model/provider evaluation infrastructure

- [ ] Add more model selection options through config/env so production and evals can easily switch provider/model pairs.
- [ ] Expand Promptfoo provider matrix with additional viable low-cost models, including local/Ollama once available.

### 8. Eval reporting and analysis

- [ ] Track eval results by bucket (`synthetic`, `real-gold`, `sad`, `ambiguous`, etc.) instead of relying only on overall pass rate.