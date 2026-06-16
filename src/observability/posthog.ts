import { PostHog, type EventMessage } from 'posthog-node'

import { getOptionalEnv } from '../utils/env'
import { logError, logInfo } from '../utils/logger'

type CaptureProperties = NonNullable<EventMessage['properties']>
type PostHogClient = Pick<PostHog, 'capture' | 'captureException' | 'shutdown'>

const client = createPostHogClient()

const posthog: PostHogClient = client ?? {
    capture: () => undefined,
    captureException: () => undefined,
    shutdown: async () => undefined,
}

export function capturePostHogEvent(input: {
    distinctId: string
    event: string
    properties?: CaptureProperties
}): void {
    posthog.capture({
        distinctId: input.distinctId,
        event: input.event,
        properties: withoutPersonProfile(input.properties),
    })
}

export function capturePostHogException(
    error: unknown,
    distinctId?: string,
    properties?: CaptureProperties,
): void {
    posthog.captureException(error, distinctId, withoutPersonProfile(properties))
}

export async function shutdownPostHog(): Promise<void> {
    if (!client) return

    try {
        await client.shutdown()
        logInfo('PostHog analytics stopped')
    } catch (error: unknown) {
        logError('Failed to shut down PostHog analytics', error)
        throw error
    }
}

function createPostHogClient(): PostHog | undefined {
    const projectToken = getOptionalEnv('POSTHOG_PROJECT_TOKEN')
    if (!projectToken) return undefined

    return new PostHog(projectToken, {
        host: getOptionalEnv('POSTHOG_HOST'),
        enableExceptionAutocapture: true,
    })
}

function withoutPersonProfile(properties: CaptureProperties | undefined): CaptureProperties {
    return {
        ...(properties ?? {}),
        $process_person_profile: false,
    }
}
