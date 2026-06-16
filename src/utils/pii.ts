const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/g;
const URL_PATTERN = /\bhttps?:\/\/\S+/gi;
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;
const CARD_NUMBER_PATTERN = /\b(?:\d[ -]*?){13,16}\b/g;

const SIGNATURE_SEPARATOR_PATTERN = /\n--\s*\n/;
const SIGNOFF_PATTERN = /^(thanks|thank you|best|best regards|regards|kind regards|sincerely|cheers|warmly|respectfully)[,!\.\s]*$/i;
const SENT_FROM_PATTERN = /^sent from my /i;

export function stripEmailSignature(text: string): string {
    const normalized = text.replace(/\r\n/g, '\n');

    const signatureSeparatorIndex = normalized.search(SIGNATURE_SEPARATOR_PATTERN);
    if (signatureSeparatorIndex !== -1) {
        return `${normalized.slice(0, signatureSeparatorIndex).trimEnd()}\n[SIGNATURE_REMOVED]`;
    }

    const lines = normalized.split('\n');
    const searchStart = Math.max(0, lines.length - 10);

    for (let index = lines.length - 1; index >= searchStart; index--) {
        const line = lines[index].trim();

        if (SIGNOFF_PATTERN.test(line) || SENT_FROM_PATTERN.test(line)) {
            return `${lines.slice(0, index).join('\n').trimEnd()}\n[SIGNATURE_REMOVED]`;
        }
    }

    return normalized;
}

export function redactPii(text: string): string {
    return text
        .replace(EMAIL_PATTERN, '[EMAIL]')
        .replace(PHONE_PATTERN, '[PHONE]')
        .replace(URL_PATTERN, '[URL]')
        .replace(SSN_PATTERN, '[SSN]')
        .replace(CARD_NUMBER_PATTERN, '[CARD_NUMBER]');
}

export function sanitizeEmailBody(text: string): string {
    return redactPii(stripEmailSignature(text));
}
