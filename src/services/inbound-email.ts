import { categorizeEmail, CategorizerTrafficSource } from './categorizer'
import { claimIdempotencyKey, markIdempotencyKeyProcessed, releaseIdempotencyKey } from './idempotency'
import { resend } from './resend-client'
import { sendNotification } from './notification'
import { capturePostHogEvent } from '../observability/posthog'
import { redactPii, sanitizeEmailBody } from '../utils/pii'
import { logInfo } from '../utils/logger'

export async function processInboundEmail(emailId: string): Promise<void> {
    const idempotencyKey = `inbound-email:${emailId}`;
    const claimResult = claimIdempotencyKey(idempotencyKey);

    if (!claimResult.claimed) {
        logInfo("Skipping duplicate inbound email processing", {
            emailId,
            existingStatus: claimResult.existingStatus,
        });
        capturePostHogEvent({
            distinctId: emailId,
            event: 'email_processing_skipped',
            properties: {
                existing_status: claimResult.existingStatus,
            },
        });
        return;
    }

    try {
        logInfo("Processing inbound email", { emailId });
        const { data: email, error } = await resend.emails.receiving.get(emailId);

        if (error) {
            throw new Error(`Error fetching email from Resend: ${error.message}`);
        }

        if (!email) {
            throw new Error("Resend did not return email data");
        }
        
        const emailToCategorize = {
            subject: redactPii(email.subject),
            body: sanitizeEmailBody(email.text || ''),
            metadata: { source: CategorizerTrafficSource.InboundEmail },
        };

        const categorizationResult = await categorizeEmail(emailToCategorize);
        
        if (!categorizationResult) {
            throw new Error("There was a problem categorizing the email");
        }
    
        capturePostHogEvent({
            distinctId: emailId,
            event: 'email_categorized',
            properties: {
                service_type_id: categorizationResult.serviceTypeId,
                service_type_label: categorizationResult.serviceType.label,
                confidence_score: categorizationResult.confidenceScore,
                should_alert_admin: categorizationResult.shouldAlertAdmin,
            },
        });

        if (categorizationResult.shouldAlertAdmin === true) {
            logInfo("Sending alert to subscribed admins", {
                emailId,
                alertReason: categorizationResult.alertReason,
            });
            const quoteData = {
                customerEmail: email.from,
                emailSubject: email.subject,
                serviceType: categorizationResult.serviceType.label,
                summary: categorizationResult.explanation
            };

            await sendNotification("discord", {
                title: "New estimate request received",
                data: quoteData,
            });

            capturePostHogEvent({
                distinctId: emailId,
                event: 'admin_alert_sent',
                properties: {
                    service_type_id: categorizationResult.serviceTypeId,
                    service_type_label: categorizationResult.serviceType.label,
                    notification_channel: 'discord',
                },
            });
        } else {
            logInfo("Categorizer result did not require an admin alert", {
                emailId,
                serviceTypeId: categorizationResult.serviceTypeId,
                confidenceScore: categorizationResult.confidenceScore,
                alertReason: categorizationResult.alertReason,
            });
        }

        markIdempotencyKeyProcessed(idempotencyKey);
        logInfo("Inbound email processing complete", { emailId });
    } catch (error) {
        releaseIdempotencyKey(idempotencyKey);
        throw error;
    }
}
