export function getOptionalEnv(name: string): string | undefined {
    const value = process.env[name]?.trim();
    return value ? value : undefined;
}

export function parsePositiveInteger(value: string | undefined): number | undefined {
    if (!value) return undefined;

    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
