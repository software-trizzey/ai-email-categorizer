import { Hono, HonoRequest } from 'hono'
import { Resend, WebhookEventPayload } from 'resend'

import { categorizeEmail } from './services/categorizer'
import { redactPii, sanitizeEmailBody } from './utils/pii'
import { sendNotification } from 'services/notification'

const app = new Hono()

const resend = new Resend(process.env.RESEND_API_KEY);

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
    webhookSecret: process.env.RESEND_WEBHOOK_SECRET!,
  });

  return result;
}

app.post('/inbound-email', async (context) => {
  let verificationResult = null;
  try {
      verificationResult = await verifyRequest(context.req);
    } catch (error: unknown) {
      console.log(error);
      return context.json({
        ok: false,
        status: 400,
        message: "Invalid webhook"
      })
  };

  if (verificationResult.type === 'email.received') {
    const { data: email, error } = await resend.emails.receiving.get(verificationResult.data.email_id);

    if (error) {
      console.error("Error fetching email:", error);
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
      console.log("Send alert to subscribed admins");
      
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