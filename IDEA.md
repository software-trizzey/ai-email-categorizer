# Applied AI Engineering with Email Inquiry Routing

## Core Project

Build an AI-powered email inquiry categorizer for a real consulting workflow:

> A potential customer emailed directly instead of using the quote request form. Rather than relying on brittle inbox filters, we’ll use an LLM to classify the inquiry, extract useful fields, and decide what should happen next.

The goal is to turn one realistic business problem into a series of progressively more advanced applied AI engineering posts.

---

## Post 1: Designing an AI Inquiry Categorization Feature End to End

**Goal:** Build the first useful version of the categorizer.

### Topics to cover

- The real-world problem: quote requests arrive through messy channels.
- Why keyword filters and inbox rules are brittle.
- Defining inquiry categories:
  - `quote_request`
  - `support_request`
  - `existing_customer_follow_up`
  - `general_sales_inquiry`
  - `vendor_or_partnership`
  - `spam`
  - `unknown`
- Extracting structured fields:
  - customer name
  - company
  - email
  - requested service
  - project description
  - budget, if mentioned
  - timeline, if mentioned
  - urgency
- Returning a typed JSON result.
- Handling confidence and `needs_human_review`.
- Creating a small evaluation set from realistic example emails.
- Building the simplest app or script that processes emails.

### Output

A working local categorizer with a typed schema.

---

## Post 2: Making the Inquiry Router Useful in a Real Workflow

**Goal:** Move from classification to action.

### Topics to cover

- Routing rules after categorization:
  - quote requests → sales/owner notification
  - support requests → support queue
  - spam/vendor outreach → ignore or archive
  - unknown/low confidence → manual review
- Creating a human review queue.
- Adding override/edit functionality.
- Saving categorization decisions.
- Generating a short internal summary.
- Optional: drafting a reply, but not sending automatically.
- Explaining why human-in-the-loop matters for customer-facing workflows.

### Output

A small workflow app that categorizes, summarizes, routes, and supports review.

---

## Post 3: Measuring AI Email Routing with Observability

**Goal:** Add production-style visibility.

### Topics to cover

- What to measure:
  - category distribution
  - confidence scores
  - latency
  - token usage/cost
  - failed parses
  - human override rate
  - low-confidence volume
  - time to review
- Instrumenting model calls.
- Tracking prompt version.
- Tracking schema version.
- Logging examples safely without leaking sensitive data.
- OpenTelemetry for traces/metrics.
- Optional PostHog events for product/workflow analytics.

### Output

An observable AI workflow with traces, metrics, and review feedback.

---

## Post 4: Running the Inquiry Categorizer Locally with Ollama and llama.cpp

**Goal:** Compare local model options using the same workflow.

### Topics to cover

- Why local inference is appealing:
  - privacy
  - cost control
  - offline development
  - avoiding vendor lock-in
- Ollama setup:
  - easy install
  - model pulling
  - HTTP API
  - quick integration
- llama.cpp setup:
  - more control
  - quantization choices
  - lower-level API
  - more tuning
- Benchmarking both on the same email examples:
  - setup complexity
  - latency
  - memory usage
  - JSON reliability
  - categorization quality
  - developer experience
- Deciding which one to use and when.

### Output

The same categorizer running against local LLM backends.

---

## Post 5: Self-Hosting a Private LLM for Email Categorization

**Goal:** Deploy a private model-backed version in the cloud.

### Topics to cover

- When local inference is not enough.
- Hosting options:
  - rented GPU instance
  - CPU-only small model
  - managed private inference
- API design for the classifier service.
- Securing access to the model endpoint.
- Queue-based processing for inbound email.
- Cost/latency tradeoffs.
- Reliability concerns:
  - retries
  - timeouts
  - fallback model
  - manual review fallback
- Comparing private hosting vs hosted APIs.

### Output

A cloud-hosted private inference endpoint powering the workflow.

---

## Post 6: Running an Email Categorizer on a Raspberry Pi

**Goal:** Explore edge AI with the same app.

### Topics to cover

- Hardware setup with photos.
- Installing the runtime.
- Choosing a small quantized model.
- Running test emails through the categorizer.
- Measuring:
  - latency
  - RAM usage
  - heat/throttling
  - output quality
- What worked, what didn’t.
- Practical use cases:
  - local-first small office automation
  - offline triage
  - privacy-sensitive environments
- Honest conclusion: useful, educational, or mostly fun?

### Output

A Raspberry Pi-powered local inquiry categorizer experiment.

---

## Why This Sequence Works

The series starts with a business problem and layers on engineering depth:

1. **Product/use case:** classify quote inquiries.
2. **Workflow:** route and review them.
3. **Production quality:** observe and evaluate them.
4. **Local AI:** run privately on your machine.
5. **Cloud private AI:** deploy securely.
6. **Edge AI:** test the limits on Raspberry Pi.

This creates a coherent body of work instead of a set of isolated AI tutorials.
