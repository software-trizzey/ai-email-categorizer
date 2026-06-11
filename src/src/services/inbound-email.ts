import { categorizeEmail } from './categorizer'
import { claimIdempotencyKey, markIdempotencyKeyProcessed, releaseIdempotencyKey } from './idempotency'
import { resend } from './resend-client'
import { sendNotification } from './notification'
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
        };

        const categorizationResult = await categorizeEmail(emailToCategorize);
        
        if (!categorizationResult) {
            throw new Error("There was a problem categorizing the email");
        }
    
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
