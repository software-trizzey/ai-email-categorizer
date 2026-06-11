export function normalizeJsonResponse(text: string): string {
    const trimmedText = text.trim();
    const withoutFence = trimmedText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

    if (withoutFence.startsWith("{") && withoutFence.endsWith("}")) {
        return withoutFence;
    }

    const jsonStartIndex = withoutFence.indexOf("{");
    const jsonEndIndex = withoutFence.lastIndexOf("}");

    if (jsonStartIndex !== -1 && jsonEndIndex > jsonStartIndex) {
        return withoutFence.slice(jsonStartIndex, jsonEndIndex + 1);
    }

    return withoutFence;
}
