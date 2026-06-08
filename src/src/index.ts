import { Hono, HonoRequest } from 'hono'
import { Resend, WebhookEventPayload } from 'resend'

import { categorizeEmail } from './services/categorizer'
import { redactPii, sanitizeEmailBody } from './utils/pii'
import { sendNotification } from 'services/notification'
import { logError, logInfo } from './utils/logger'

const app = new Hono()

const resend = new Resend(process.env.RESEND_API_KEY);

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

async function verifyRequest(request: HonoRequest): Promise<WebhookEventPayload> {
  const result = resend.webhooks.verify({
    payload: await request.text(),
    headers: {
      id: request.header('svix-id') || '',
      timestamp: request.header('svix-timestamp') || '',
      signature: request.header('svix-signature') || '',
    },
    webhookSecret: getResendWebhookSecret(),
  });

  return result;
}

function getResendWebhookSecret(): string {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();

  if (!webhookSecret) {
    throw new Error("Missing required environment variable: RESEND_WEBHOOK_SECRET");
  }

  if (webhookSecret.startsWith("re_")) {
    throw new Error("RESEND_WEBHOOK_SECRET is set to a Resend API key. Use the webhook signing secret instead.");
  }

  return webhookSecret;
}

app.post('/inbound-email', async (context) => {
  let verificationResult = null;
  try {
      verificationResult = await verifyRequest(context.req);
    } catch (error: unknown) {
      logError("Invalid inbound email webhook", error);
      return context.json({
        ok: false,
        status: 400,
        message: "Invalid webhook"
      })
  };

  if (verificationResult.type === 'email.received') {
    const { data: email, error } = await resend.emails.receiving.get(verificationResult.data.email_id);

    if (error) {
      logError("Error fetching email from Resend", error);
      return context.json({
        ok: false,
        status: 500,
        message: error.message
      });
    }
    
    const emailToCategorize = {
      subject: redactPii(email.subject),
      body: sanitizeEmailBody(email.text || ''),
    };

    const categorizationResult = await categorizeEmail(emailToCategorize);
    
    if (!categorizationResult) {
      return context.json({
        ok: false,
        status: 500,
        message: "There was a problem categorizing the email"
      });
    }
  
    if (categorizationResult.confidenceScore > 0.7) {
      logInfo("Sending alert to subscribed admins");      
      const quoteData = {
        customerEmail: email.from,
        emailSubject: email.subject,
        serviceType: categorizationResult.serviceType
      };

      await sendNotification("discord", {
        title: "New estimate request received",
        data: quoteData,
      });
    }

    return context.json({
      ok: true,
      status: 200,
      message: "Email categorization successful"
    });
  }
});

export default app