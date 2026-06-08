export const serviceTypes = [
    {
        id: "stumpGrinding",
        label: "Stump grinding",
        description: "Grinding an existing stump down below grade while leaving the roots in place.",
    },
    {
        id: "stumpRemoval",
        label: "Stump removal",
        description: "Removing or extracting the stump from the ground, usually including the root ball.",
    },
    {
        id: "rootRemoval",
        label: "Root removal",
        description: "Removing exposed, invasive, or leftover tree roots without necessarily removing a stump.",
    },
    {
        id: "treePruning",
        label: "Tree pruning",
        description: "Trimming, pruning, or cutting limbs/branches on a standing tree.",
    },
    {
        id: "unknown",
        label: "Unknown or not listed",
        description: "Use when the requested service is unclear or does not match any listed service type.",
    },
] as const;

export type ServiceType = (typeof serviceTypes)[number];
export type ServiceTypeId = ServiceType["id"];

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
