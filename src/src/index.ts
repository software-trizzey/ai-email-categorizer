import { Hono } from 'hono'
import type { WebhookEventPayload } from 'resend'

import { categorizeEmail } from './services/categorizer'
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

app.post('/eval/categorize', async (context) => {
  if (process.env.ENABLE_EVAL_ENDPOINTS !== 'true') {
    return context.json({
      ok: false,
      status: 404,
      message: "Not found",
    }, 404);
  }

  const payload = await context.req.json().catch(() => null);

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return context.json({
      ok: false,
      status: 400,
      message: "Expected JSON body",
    }, 400);
  }

  const { subject, body } = payload as Record<string, unknown>;

  if (typeof subject !== 'string' || typeof body !== 'string' || !subject.trim() || !body.trim()) {
    return context.json({
      ok: false,
      status: 400,
      message: "Expected non-empty subject and body strings",
    }, 400);
  }

  const result = await categorizeEmail({ subject, body });

  if (!result) {
    return context.json({
      ok: false,
      status: 500,
      message: "Categorizer returned no result",
    }, 500);
  }

  return context.json({
    ok: true,
    status: 200,
    result: {
      explanation: result.description,
      serviceTypeId: result.serviceTypeId,
      confidenceScore: result.confidenceScore,
      serviceType: result.serviceType,
    },
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