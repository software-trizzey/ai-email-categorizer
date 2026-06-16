import type { Context } from 'hono'

export function runAfterResponse(context: Context, promise: Promise<unknown>): void {
    try {
        context.executionCtx.waitUntil(promise);
    } catch {
        void promise;
    }
}
