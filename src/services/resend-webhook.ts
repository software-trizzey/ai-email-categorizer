import type { HonoRequest } from 'hono'
import type { WebhookEventPayload } from 'resend'

import { resend } from './resend-client'

export async function verifyResendWebhook(request: HonoRequest): Promise<WebhookEventPayload> {
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
