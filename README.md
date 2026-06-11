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

## Self-hosted Gemma on RunPod

Recommended setup: run `google/gemma-4-E4B-it` behind vLLM's OpenAI-compatible API.

On the RunPod pod, expose HTTP port `8000` and start vLLM:

```sh
export VLLM_API_KEY=your-secret-key

vllm serve google/gemma-4-E4B-it \
  --host 0.0.0.0 \
  --port 8000 \
  --max-model-len 8192 \
  --gpu-memory-utilization 0.90 \
  --limit-mm-per-prompt '{"image":0,"audio":0}' \
  --api-key "$VLLM_API_KEY"
```

Then configure this app with the RunPod proxy URL. The base URL must end in `/v1`:

```sh
export CATEGORIZER_PROVIDER=self-hosted
export CATEGORIZER_MODEL=google/gemma-4-E4B-it
export CATEGORIZER_BASE_URL=https://<pod-id>-8000.proxy.runpod.net/v1
export CATEGORIZER_API_KEY=your-secret-key
export CATEGORIZER_MAX_TOKENS=256
export CATEGORIZER_CONTEXT_WINDOW=8192
```

Quick checks:

```sh
curl "$CATEGORIZER_BASE_URL/chat/completions" \
  -H "Authorization: Bearer $CATEGORIZER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"google/gemma-4-E4B-it","messages":[{"role":"user","content":"Return JSON only: {\"ok\": true}"}],"temperature":0,"max_tokens":50,"response_format":{"type":"json_object"}}'

ENABLE_EVAL_ENDPOINTS=true bun run dev
curl http://localhost:3000/eval/categorize \
  -H "Content-Type: application/json" \
  -d '{"subject":"Need a quote for stump grinding","body":"Can you send an estimate to remove two stumps in my yard?"}'
```

If vLLM rejects an unknown `think` option from the self-hosted adapter, replace it with `chat_template_kwargs: { enable_thinking: false }` in `src/services/categorizer/model.ts`, or remove the option.

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

