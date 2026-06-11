export type NotificationChannel = "discord";

export interface NotificationPayload {
    title: string;
    message?: string;
    data?: Record<string, unknown>;
}

type NotificationSender = (payload: NotificationPayload) => Promise<void>;

const notificationSenders: Record<NotificationChannel, NotificationSender> = {
    discord: sendDiscordNotification,
};

/**
 * Send a notification through the requested channel.
 *
 * Channel-specific details like webhook URLs, request body format, and HTTP
 * handling stay inside this service instead of leaking into callers.
 */
export async function sendNotification(channel: NotificationChannel, payload: NotificationPayload): Promise<void> {
    const sender = notificationSenders[channel];

    if (!sender) {
        throw new Error(`Unsupported notification channel: ${channel}`);
    }

    await sender(payload);
}

async function sendDiscordNotification(payload: NotificationPayload): Promise<void> {
    const webhookUrl = getRequiredEnv("DISCORD_WEBHOOK_URL");

    const response = await fetch(webhookUrl, {
        method: "POST",
        body: JSON.stringify(toDiscordWebhookBody(payload)),
        headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Discord notification failed: ${response.status} ${errorBody}`);
    }
}

function toDiscordWebhookBody(payload: NotificationPayload) {
    const fields = Object.entries(payload.data ?? {}).map(([name, value]) => ({
        name,
        value: formatDiscordFieldValue(value),
        inline: false,
    }));

    return {
        content: payload.message
            ? `**${payload.title}**\n${payload.message}`
            : `**${payload.title}**`,
        embeds: fields.length > 0
            ? [{
                title: "Details",
                fields,
                timestamp: new Date().toISOString(),
            }]
            : undefined,
    };
}

function formatDiscordFieldValue(value: unknown): string {
    const formattedValue = typeof value === "string"
        ? value
        : JSON.stringify(value, null, 2);

    return formattedValue.slice(0, 1024) || "N/A";
}

function getRequiredEnv(name: string): string {
    const value = process.env[name];

    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
}