# AI Email Categorizer


Goal: a system that accepts emails and categorizes them based on intent. 


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

