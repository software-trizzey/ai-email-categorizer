import serviceTypeDefinitions from "./service-types.json";

export type ServiceTypeId = Extract<keyof typeof serviceTypeDefinitions, string>;
type ServiceTypeDefinition = (typeof serviceTypeDefinitions)[ServiceTypeId];

const serviceTypeEntries = Object.entries(serviceTypeDefinitions) as Array<[ServiceTypeId, ServiceTypeDefinition]>;

export type ServiceType = {
    [Id in ServiceTypeId]: { id: Id } & (typeof serviceTypeDefinitions)[Id];
}[ServiceTypeId];

export const serviceTypes: ServiceType[] = serviceTypeEntries.map(([id, definition]) => ({
    id,
    ...definition,
}));

export const UNKNOWN_SERVICE_TYPE_ID: ServiceTypeId = "unknown";

export const serviceTypePromptOptions = serviceTypes.map(({ id, label, description }) => ({
    id,
    label,
    description,
}));

export function findServiceType(value: unknown): ServiceType | null {
    if (typeof value !== "string") return null;

    const normalizedValue = normalizeServiceTypeValue(value);

    return serviceTypes.find((serviceType) => (
        normalizeServiceTypeValue(serviceType.id) === normalizedValue
        || normalizeServiceTypeValue(serviceType.label) === normalizedValue
    )) ?? null;
}

function normalizeServiceTypeValue(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
