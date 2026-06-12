import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions'

import { logError, logInfo } from '../utils/logger'

const DEFAULT_SERVICE_NAME = 'ai-email-categorizer'
const DEFAULT_SERVICE_VERSION = '0.0.0'
const DEFAULT_DEPLOYMENT_ENVIRONMENT = 'development'

let telemetrySdk: NodeSDK | undefined
let isShutdownStarted = false

export function startTelemetry(): void {
  if (process.env.OTEL_ENABLED !== 'true') {
    return
  }

  if (telemetrySdk) {
    return
  }

  const serviceName = process.env.OTEL_SERVICE_NAME?.trim() || DEFAULT_SERVICE_NAME
  const serviceVersion = process.env.OTEL_SERVICE_VERSION?.trim() || DEFAULT_SERVICE_VERSION
  const deploymentEnvironment = process.env.OTEL_DEPLOYMENT_ENVIRONMENT?.trim()
    || process.env.NODE_ENV?.trim()
    || DEFAULT_DEPLOYMENT_ENVIRONMENT

  telemetrySdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: serviceVersion,
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: deploymentEnvironment,
    }),
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [],
    metricReaders: [],
    logRecordProcessors: [],
  })

  telemetrySdk.start()

  logInfo('OpenTelemetry tracing started', {
    serviceName,
    serviceVersion,
    deploymentEnvironment,
  })

  process.once('SIGTERM', () => {
    void shutdownTelemetry('SIGTERM')
  })

  process.once('SIGINT', () => {
    void shutdownTelemetry('SIGINT')
  })
}

async function shutdownTelemetry(signal: 'SIGTERM' | 'SIGINT'): Promise<void> {
  if (isShutdownStarted) {
    return
  }

  isShutdownStarted = true

  try {
    await telemetrySdk?.shutdown()
    logInfo('OpenTelemetry tracing stopped', { signal })
  } catch (error: unknown) {
    logError('Failed to shut down OpenTelemetry tracing', error, { signal })
  } finally {
    process.exit(0)
  }
}

