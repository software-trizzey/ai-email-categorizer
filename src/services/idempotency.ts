type IdempotencyKeyStatus = "processing" | "processed";

interface IdempotencyEntry {
    status: IdempotencyKeyStatus;
    expiresAt: number;
}

export interface IdempotencyClaimResult {
    claimed: boolean;
    existingStatus?: IdempotencyKeyStatus;
}

const DEFAULT_IDEMPOTENCY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const idempotencyEntries = new Map<string, IdempotencyEntry>();

export function claimIdempotencyKey(
    key: string,
    ttlMs = DEFAULT_IDEMPOTENCY_TTL_MS,
): IdempotencyClaimResult {
    cleanupExpiredIdempotencyEntries();

    const existingEntry = idempotencyEntries.get(key);
    const now = Date.now();

    if (existingEntry && existingEntry.expiresAt > now) {
        return {
            claimed: false,
            existingStatus: existingEntry.status,
        };
    }

    idempotencyEntries.set(key, {
        status: "processing",
        expiresAt: now + ttlMs,
    });

    return { claimed: true };
}

export function markIdempotencyKeyProcessed(
    key: string,
    ttlMs = DEFAULT_IDEMPOTENCY_TTL_MS,
): void {
    const now = Date.now();

    idempotencyEntries.set(key, {
        status: "processed",
        expiresAt: now + ttlMs,
    });
}

export function releaseIdempotencyKey(key: string): void {
    idempotencyEntries.delete(key);
}

function cleanupExpiredIdempotencyEntries(): void {
    const now = Date.now();

    idempotencyEntries.forEach((entry, key) => {
        if (entry.expiresAt <= now) {
            idempotencyEntries.delete(key);
        }
    });
}
