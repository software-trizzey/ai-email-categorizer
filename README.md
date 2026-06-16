# AI Email Categorizer

A system that ingests emails and categorizes them based on intent. To make this interesting i'm mapping it to a real world usecase where it will determine if the email is asking for a quote/estimate from a business. If the system confirms that's the sender's intent it will alert the admins of that business via their preferred notification channel (SMS, Slack. Discord, Email, etc.)

## Development

Install dependencies:

```sh
bun install
```

Run the app from the repo root:

```sh
bun run dev
```

Open http://localhost:3000.

Run categorizer evals:

```sh
bun run eval:categorizer
bun run eval:categorizer:service
bun run eval:categorizer:view
```

For local service evals, start the app with `ENABLE_EVAL_ENDPOINTS=true bun run dev`, then run `bun run eval:categorizer:service`.

See `evals/README.md` for provider API keys and filtering examples.

### OpenTelemetry local smoke test

Tracing is disabled by default. To verify categorizer spans locally with Jaeger:

```sh
docker run --rm --name jaeger \
  -e COLLECTOR_OTLP_ENABLED=true \
  -p 16686:16686 \
  -p 4318:4318 \
  jaegertracing/all-in-one:1.57
```

In another terminal, run the app with tracing and eval endpoints enabled:

```sh
OTEL_ENABLED=true \
ENABLE_EVAL_ENDPOINTS=true \
OTEL_SERVICE_NAME=ai-email-categorizer \
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4318/v1/traces \
bun run dev
```

Then trigger one service eval:

```sh
bun run eval:categorizer:service -- --filter-first-n 1
```

Open http://localhost:16686 and search for the `ai-email-categorizer` service. You should see a `categorizer.run` span with provider/model/token/result metadata. Spans intentionally record email subject/body lengths, not subject text, body text, prompt text, raw model output, or alert explanations.

## Deployment

The categorizer model is selected with environment variables, so deployments can use either a third-party provider or a private self-hosted model.

### OpenTelemetry on Render

Telemetry can be enabled in Render through environment variables only. Keep tracing off by default, then add these dashboard-managed values when you have an OTLP-compatible backend ready:

```sh
OTEL_ENABLED=true
OTEL_SERVICE_NAME=ai-email-categorizer
OTEL_DEPLOYMENT_ENVIRONMENT=production
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=<provider-otlp-http-traces-endpoint>
```

If your observability provider requires authentication, set the standard OpenTelemetry exporter headers variable in Render as well. See the OpenTelemetry [OTLP exporter header configuration docs](https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/#header-configuration) for the expected key-value format.

```sh
OTEL_EXPORTER_OTLP_HEADERS=<provider-specific-headers>
```

For local Jaeger, the traces endpoint is `http://localhost:4318/v1/traces`. For hosted providers, use the vendor's OTLP HTTP traces endpoint.

### PostHog analytics and OpenTelemetry production setup

PostHog receives backend analytics events through `posthog-node` and AI categorizer traces through its AI Observability OTLP endpoint. You need a PostHog project and its **Project API Key / project token**. Do not use a personal API key.

Pick the ingestion host for your PostHog region:
- US cloud: `https://us.i.posthog.com`
- EU cloud: `https://eu.i.posthog.com`

Set these Render env vars and redeploy. Use standard OpenTelemetry env vars as the single source of truth for tracing:

```sh
OTEL_ENABLED=true
OTEL_SERVICE_NAME=ai-email-categorizer
OTEL_DEPLOYMENT_ENVIRONMENT=production
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://us.i.posthog.com/i/v0/ai/otel
OTEL_EXPORTER_OTLP_TRACES_HEADERS="Authorization=Bearer <ph_project_token>"
POSTHOG_PROJECT_TOKEN=<ph_project_token>
POSTHOG_HOST=https://us.i.posthog.com
```

Privacy tradeoff: the app intentionally sends model/provider/token/result metadata and email subject/body lengths, but not the raw prompt, email subject, email body, raw model output, explanation text, or alert reason text. This keeps production telemetry useful for latency, cost, and categorization monitoring without sending inbound email content to PostHog. The tradeoff is that PostHog AI Observability will be metadata-heavy and will not show a rich conversation/generation preview. If raw AI content is ever enabled, it should be explicit opt-in, scrubbed before export, and covered by the right privacy/security review, including vendor DPA, retention, access controls, and region requirements.

To test, temporarily set `ENABLE_EVAL_ENDPOINTS=true`, redeploy, run one `/eval/categorize` request, then look in PostHog AI Observability for the `ai-email-categorizer` service and a `categorizer.run` span/generation. Disable `ENABLE_EVAL_ENDPOINTS` after the smoke test.

### Option A: managed third-party setup (OpenAI)

Use this for the simplest managed setup:

```sh
CATEGORIZER_PROVIDER=openai
CATEGORIZER_MODEL=gpt-4o-mini
OPENAI_API_KEY=<openai-api-key>
```

`CATEGORIZER_BASE_URL` and `CATEGORIZER_API_KEY` can be left blank for the default OpenAI endpoint.

### Option B: Self-hosted Gemma on RunPod

Recommended private setup: run `google/gemma-4-E4B-it` behind vLLM's OpenAI-compatible API.

Note: this vllm latest template was used: https://www.console.runpod.io/hub/template/vllm-latest?id=iqilnw0ymf

1. Create a RunPod pod with a 24GB+ VRAM GPU for testing, expose HTTP port `8000`, and add a pod env var:

```sh
VLLM_API_KEY=<private-api-key>
```
Note: for production this should be set as a runpod secret and read securely: https://docs.runpod.io/pods/templates/secrets

Generate a local key with:

```sh
echo "sk-$(openssl rand -hex 32)"
```

2. Start vLLM on the RunPod pod. If your template already prepends `vllm serve`, use only the args after `serve`.

The template I used expected this format
```sh
--host=0.0.0.0 --port=8000 --model=google/gemma-4-E4B-it --dtype=bfloat16 --trust-remote-code --enforce-eager --gpu-memory-utilization=0.95 --max-model-len=8192
```

3. Configure this app/Render service. The base URL must end in `/v1`:

```sh
CATEGORIZER_PROVIDER=self-hosted
CATEGORIZER_MODEL=google/gemma-4-E4B-it
CATEGORIZER_BASE_URL=https://<pod-id>-8000.proxy.runpod.net/v1
CATEGORIZER_API_KEY=<same-value-as-VLLM_API_KEY>
CATEGORIZER_MAX_TOKENS=400
CATEGORIZER_CONTEXT_WINDOW=8192
```

In Render, keep these values dashboard-managed. `render.yaml` marks the categorizer env vars as `sync: false` so pushes do not overwrite provider/model/endpoint choices.

4. Smoke test vLLM directly:

```sh
curl "$CATEGORIZER_BASE_URL/models" \
  -H "Authorization: Bearer $CATEGORIZER_API_KEY"

curl "$CATEGORIZER_BASE_URL/chat/completions" \
  -H "Authorization: Bearer $CATEGORIZER_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @- <<'JSON'
{
  "model": "google/gemma-4-E4B-it",
  "temperature": 0,
  "max_tokens": 400,
  "response_format": { "type": "json_object" },
  "messages": [
    {
      "role": "system",
      "content": "You are an email categorization specialist that reviews inbound emails and determines their intent. Return only valid JSON."
    },
    {
      "role": "user",
      "content": "Determine if this email is asking for a quote. Valid serviceTypeId values are stumpGrinding, stumpRemoval, rootRemoval, treePruning, unknown. Return JSON with explanation, serviceTypeId, confidenceScore, shouldAlertAdmin, and alertReason. Subject: Need a quote for stump grinding\nEmail Body: Hi, I have two old tree stumps in my backyard. Can you send me an estimate to grind them below grade next week?"
    }
  ]
}
JSON
```

5. Smoke test through the deployed app:

Temporarily set `ENABLE_EVAL_ENDPOINTS=true` in Render and redeploy, then call the Render service URL to confirm the deployed app can reach the RunPod model:

```sh
export RENDER_SERVICE_URL=https://<your-render-service>.onrender.com

curl "$RENDER_SERVICE_URL/eval/categorize" \
  -H "Content-Type: application/json" \
  --data-binary @- <<'JSON'
{
  "subject": "Need a quote for stump grinding",
  "body": "Hi, I have two old tree stumps in my backyard. Can you send me an estimate to grind them below grade next week?"
}
JSON
```

For local app testing against the same RunPod model, set the categorizer env vars locally and run `ENABLE_EVAL_ENDPOINTS=true bun run dev`, then call `http://localhost:3000/eval/categorize`.

Disable `ENABLE_EVAL_ENDPOINTS` after testing public deployments.

For end-to-end testing and initial production wiring, a RunPod pod is the simplest option because it provides a stable OpenAI-compatible `/v1` endpoint. If request volume stays sporadic and minimal throughout the month, switch to RunPod Serverless with `min workers = 0` to avoid paying for an idle 24/7 GPU. Serverless may require using a vLLM/OpenAI-compatible serverless template or adding a small adapter that calls RunPod's job API and waits for the result.

## System

**Flow**
Email -> Webhook endpoint -> *Orch. service -> Categorization service -> Orch. service -> Notification service -> Admin.

*Orchestration service

### Steps:
1. Email hits an inbox and is automatically forwarded to our webhook as HTTP POST request.
    - If forwarding to endpoint isn't possible then we can setup an email inbox that we can
      watch for new messages and ingest them that way.
2. Email enters webhook endpoint where we verify its from expected origin and then run initial pass without AI.
    - If using Resend inbound emails their SDK let's us verify signatures on incoming emails `resend.webhooks.verify()`
    - If it looks like spam or the message is obviously irrelevant (incomplete, etc.) we ignore it.
3. System will get email subject + message then pass them to our categorization service.
4. Categorization service will use the subject and message to determine the sender's intent.
    - The service should be generic enough that it could work without AI at all.
    - If AI is used it should be easy to swap out the platform/model provider so we're not locked in.
      This also paves the way for local LLM or self-hosted LLM use.
    - The service should track the input (subject, body, metadata like model, tokens used, etc.) and result
      so we can use that to improve service. This should be toggle-able so we can provide non-data retention flow.
5. Categorization service will return JSON response and result with a confidence score and concise summary of content.
6. Caller will use the confidence score as a gate to determine the next steps. If score is 70% or higher we can alert
   subscribed users via Discord/Slack etc. This should be a small notification service so we can swap the notification channel as needed.

### Notes
- Need to determine how the email is sent to the webhook so we can determine auth mechanism. I think resend has inbound feature we can use for this integration. Then we can use HMAC signature in requests for clean security. ✅
- Handle cases where the system fails. Resend stores emails before sending them to webhook and we can retrieve the email via `email.recieved` webhook event. Can access ID via `event.data.email_id`. This let's us setup simple retry logic incase system drops email during processing.
    - More: https://resend.com/docs/dashboard/receiving/introduction#3-receive-email-events


### Tech Stack

- Render for hosting
- Resend for inbound Email webhook integration
- Bun + Hono Typescript for application server
    - Eslint and prettier
    - Vite for tests
- Pi AI package for easy management/swapping of model providers https://github.com/earendil-works/pi/tree/main/packages/ai
- Postgres for storing input data and results for testing. Strip PPI!
- Discord/Slack Secrets for notification service channel messaging. (this is a v1 feature as the core of the project is accurately determining email intent)
- Sentry for error tracking
- OpenTelemtry for model observability (v2)
- Promptfoo for evals.

