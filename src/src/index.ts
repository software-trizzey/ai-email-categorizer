import { Hono } from 'hono'
import type { WebhookEventPayload } from 'resend'

import { processInboundEmail } from './services/inbound-email'
import { verifyResendWebhook } from './services/resend-webhook'
import { runAfterResponse } from './utils/background'
import { logError, logInfo } from './utils/logger'

const app = new Hono()

app.onError((error, context) => {
  logError("Unhandled request error", error, {
    method: context.req.method,
    path: context.req.path,
  });

  return context.json({
    ok: false,
    status: 500,
    message: "Internal server error",
  }, 500);
});

app.get('/health', (context) => {
    return context.json({
      ok: true, 
      status: 200,
      meessage: "Service up"
    });
})

app.post('/inbound-email', async (context) => {
  let verificationResult: WebhookEventPayload;

  try {
    verificationResult = await verifyResendWebhook(context.req);
  } catch (error: unknown) {
    logError("Invalid inbound email webhook", error);
    return context.json({
      ok: false,
      status: 400,
      message: "Invalid webhook"
    }, 400);
  }

  if (verificationResult.type !== 'email.received') {
    logInfo("Ignoring unsupported webhook event", { eventType: verificationResult.type });
    return context.json({
      ok: true,
      status: 200,
      message: "Webhook event ignored"
    });
  }

  const emailId = verificationResult.data.email_id;
  logInfo("Inbound email webhook accepted", { emailId });

  runAfterResponse(context, processInboundEmail(emailId).catch((error) => {
    logError("Failed to process inbound email", error, { emailId });
  }));

  return context.json({
    ok: true,
    status: 200,
    message: "Webhook accepted"
  });
});

export default app