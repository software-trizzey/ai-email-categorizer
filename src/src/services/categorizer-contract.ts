import { z } from "zod";

import {
    serviceTypes,
    UNKNOWN_SERVICE_TYPE_ID,
    type ServiceTypeId,
} from "./service-types";

const CATEGORIZER_RESPONSE_FORMAT_NAME = "email_categorization";
const serviceTypeIdValues = serviceTypes.map(({ id }) => id) as [ServiceTypeId, ...ServiceTypeId[]];

export const CategorizerOutputSchema = z.strictObject({
    explanation: z.string().trim().min(1),
    serviceTypeId: z.enum(serviceTypeIdValues),
    confidenceScore: z.number().min(0).max(1),
    shouldAlertAdmin: z.boolean(),
    alertReason: z.string().trim().min(1),
}).superRefine((output, context) => {
    if (!output.shouldAlertAdmin) return;

    if (output.serviceTypeId === UNKNOWN_SERVICE_TYPE_ID) {
        context.addIssue({
            code: "custom",
            path: ["shouldAlertAdmin"],
            message: "shouldAlertAdmin cannot be true when serviceTypeId is unknown",
        });
    }

    if (output.confidenceScore <= 0.7) {
        context.addIssue({
            code: "custom",
            path: ["shouldAlertAdmin"],
            message: "shouldAlertAdmin can only be true when confidenceScore is above 0.7",
        });
    }
});

export type CategorizerOutput = z.infer<typeof CategorizerOutputSchema>;

export class CategorizerContractValidationError extends Error {
    constructor(message: string, public details: Record<string, unknown>) {
        super(message);
        this.name = "CategorizerContractValidationError";
    }
}

function withoutJsonSchemaMeta(schema: unknown): Record<string, unknown> {
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
        throw new Error("Categorizer JSON schema generation did not return an object");
    }

    const { $schema: _schema, ...jsonSchema } = schema as Record<string, unknown>;
    return jsonSchema;
}

export const categorizerJsonSchema = withoutJsonSchemaMeta(z.toJSONSchema(CategorizerOutputSchema));

export const categorizerOpenAiResponsesFormat = {
    type: "json_schema",
    name: CATEGORIZER_RESPONSE_FORMAT_NAME,
    strict: true,
    schema: categorizerJsonSchema,
} as const;

export const categorizerPromptfooResponseFormat = {
    type: "json_schema",
    json_schema: {
        name: CATEGORIZER_RESPONSE_FORMAT_NAME,
        strict: true,
        schema: categorizerJsonSchema,
    },
} as const;

export function validateCategorizerOutput(value: unknown): CategorizerOutput {
    const result = CategorizerOutputSchema.safeParse(value);

    if (!result.success) {
        throw new CategorizerContractValidationError("Categorizer response failed contract validation", {
            issues: result.error.issues,
            value,
        });
    }

    return result.data;
}

export function createSafeCategorizerOutput(alertReason: string): CategorizerOutput {
    return {
        explanation: alertReason,
        serviceTypeId: UNKNOWN_SERVICE_TYPE_ID,
        confidenceScore: 0,
        shouldAlertAdmin: false,
        alertReason,
    };
}
