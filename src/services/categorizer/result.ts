import { normalizeJsonResponse } from "../../utils/json";
import { isRecord } from "../../utils/object";
import {
    createSafeCategorizerOutput,
    validateCategorizerOutput,
    type CategorizerOutput,
} from "./contract";
import {
    findServiceType,
    type ServiceType,
    type ServiceTypeId,
} from "./service-types";

export const SAFE_CATEGORIZER_ALERT_REASON = "Categorizer response could not be parsed or validated; no admin alert sent.";

export type CategorizationResult = CategorizerOutput & {
    serviceTypeId: ServiceTypeId;
    serviceType: ServiceType;
};

class CategorizerParseError extends Error {
    constructor(message: string, public details: Record<string, unknown>) {
        super(message);
        this.name = "CategorizerParseError";
    }
}

export function parseCategorizerResponse(text: string): CategorizationResult {
    const normalizedText = normalizeJsonResponse(text);
    const parsed: unknown = JSON.parse(normalizedText);

    if (!isRecord(parsed)) {
        throw new CategorizerParseError("Categorizer response was not a JSON object", { parsed });
    }

    return toCategorizationResult(validateCategorizerOutput(parsed));
}

export function createSafeCategorizationResult(alertReason = SAFE_CATEGORIZER_ALERT_REASON): CategorizationResult {
    return toCategorizationResult(createSafeCategorizerOutput(alertReason));
}

function toCategorizationResult(output: CategorizerOutput): CategorizationResult {
    const serviceType = findServiceType(output.serviceTypeId);

    if (!serviceType) {
        throw new CategorizerParseError("Categorizer response included an unknown service type", { output });
    }

    return {
        ...output,
        serviceTypeId: serviceType.id,
        serviceType,
    };
}
