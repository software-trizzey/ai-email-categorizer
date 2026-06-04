import { Hono } from 'hono'
import { Resend } from 'resend'

import { categorizeEmail } from './services/categorizer'

const app = new Hono()

const resend = new Resend(process.env.RESEND_API_KEY);

app.get('/', (context) => {
  return context.text('Hello Hono!')
})

app.post('/inbound-email', async (context) => {
  let verificationResult = null;
  try {
      verificationResult = resend.webhooks.verify({
        payload: await context.req.text(),
        headers: {
          id: context.req.header('svix-id') || '',
          timestamp: context.req.header('svix-timestamp') || '',
          signature: context.req.header('svix-signature') || '',
        },
        webhookSecret: process.env.RESEND_WEBHOOK_SECRET!,
      });
      console.log("verification result", verificationResult);
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
      // TODO: handle the error better than this
      console.error("Error fetching email:", error);
      return context.json({
        ok: false,
        status: 500,
        message: error.message
      });
    }
    
    const emailToCategorize = {
      subject: email.subject,
      body: email.text || '',
      // metadata: { ...email } // FIXME: remove customer PII
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
      // TODO: send alert
      console.log("Send alert to subscribed admins");
    }

    return context.json({
      ok: true,
      status: 200,
      message: "Email categorization successful"
    });
  }
});

export default app