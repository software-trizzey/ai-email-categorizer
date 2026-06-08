type LogContext = Record<string, unknown>;

export function logInfo(message: string, context?: LogContext): void {
    writeLog("info", message, undefined, context);
}

export function logWarn(message: string, context?: LogContext): void {
    writeLog("warn", message, undefined, context);
}

export function logError(message: string, error?: unknown, context?: LogContext): void {
    writeLog("error", message, error, context);
}

function writeLog(level: "info" | "warn" | "error", message: string, error?: unknown, context?: LogContext): void {
    const logEntry = {
        level,
        message,
        timestamp: new Date().toISOString(),
        ...(context ? { context } : {}),
        ...(error ? { error: serializeError(error) } : {}),
    };

    const serializedLogEntry = JSON.stringify(logEntry, null, 2);

    if (level === "error") {
        console.error(serializedLogEntry);
        return;
    }

    if (level === "warn") {
        console.warn(serializedLogEntry);
        return;
    }

    console.log(serializedLogEntry);
}

function serializeError(error: unknown): unknown {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack,
            cause: error.cause ? serializeError(error.cause) : undefined,
        };
    }

    return error;
}
