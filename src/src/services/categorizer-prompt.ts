import {
    serviceTypePromptOptions,
    UNKNOWN_SERVICE_TYPE_ID,
} from "./service-types";

export const CATEGORIZER_SYSTEM_PROMPT = "You are an email categorization specialist that reviews inbound emails and determines their intent.";

const SERVICE_TYPES_PROMPT_JSON = JSON.stringify(serviceTypePromptOptions, null, 2);

export function buildCategorizerUserPrompt(subject: string, body: string): string {
    if (!subject || !body) throw new Error("Invalid input detected. Please provide an email subject and body");

    return `Determine if the provided email is asking for a quote/estimate from the business based on the subject and body contents.
For valid quote/estimate requests, infer the most likely service type from the serviceTypes list below. If the email asks about multiple listed services, choose the primary or most prominent listed service.
The serviceTypeId field must be exactly one of the ids from serviceTypes. Use "${UNKNOWN_SERVICE_TYPE_ID}" if the requested service is unclear, does not match the list, or the email is not asking for a quote/estimate.
If the email is not asking for a quote/estimate, set serviceTypeId to "${UNKNOWN_SERVICE_TYPE_ID}", use a confidenceScore of 0.3 or lower, set shouldAlertAdmin to false, and explain that this is not a quote request.
If serviceTypeId is "${UNKNOWN_SERVICE_TYPE_ID}", use a confidenceScore below 0.7 and set shouldAlertAdmin to false so callers do not treat it as an actionable service request.
The confidenceScore field must be a number between 0 and 1 that reflects confidence in both quote intent and service type.
Set shouldAlertAdmin to true when the email is an actionable quote/estimate request for at least one listed service type and the confidenceScore is above 0.7. Multi-service requests should still alert when at least one requested service is listed and the best matching serviceTypeId is clear. Otherwise set shouldAlertAdmin to false.
The alertReason field must explain why an admin should or should not be alerted.

serviceTypes:
${SERVICE_TYPES_PROMPT_JSON}

Return only valid JSON. Do not include markdown, comments, or explanatory text outside the JSON.

Expected response format:
{
  "explanation": "The sender is asking the business for a quote.",
  "serviceTypeId": "stumpGrinding",
  "confidenceScore": 0.92,
  "shouldAlertAdmin": true,
  "alertReason": "The sender is requesting an estimate for stump grinding, which is a listed service."
}

Input:
Subject: ${subject}
Email Body: ${body}`;
}

export function buildPromptfooCategorizerPrompt(): string {
    return `${CATEGORIZER_SYSTEM_PROMPT}\n\n${buildCategorizerUserPrompt("{{subject}}", "{{body}}")}\n`;
}
