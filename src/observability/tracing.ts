import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions'

import { getOptionalEnv } from '../utils/env'
import { logError, logInfo } from '../utils/logger'

const DEFAULT_SERVICE_NAME = 'ai-email-categorizer'
const DEFAULT_SERVICE_VERSION = '0.0.0'
const DEFAULT_DEPLOYMENT_ENVIRONMENT = 'development'

type TraceExporterConfig = {
  exporter: OTLPTraceExporter
  name: string
  endpoint?: string
}

let telemetrySdk: NodeSDK | undefined
let isShutdownStarted = false

export function startTelemetry(): void {
  if (process.env.OTEL_ENABLED !== 'true') {
    return
  }

  if (telemetrySdk) {
    return
  }

  const serviceName = getOptionalEnv('OTEL_SERVICE_NAME') ?? DEFAULT_SERVICE_NAME
  const serviceVersion = getOptionalEnv('OTEL_SERVICE_VERSION') ?? DEFAULT_SERVICE_VERSION
  const deploymentEnvironment = getOptionalEnv('OTEL_DEPLOYMENT_ENVIRONMENT')
    ?? getOptionalEnv('NODE_ENV')
    ?? DEFAULT_DEPLOYMENT_ENVIRONMENT

  const traceExporterConfig = createTraceExporter()

  telemetrySdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: serviceVersion,
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: deploymentEnvironment,
    }),
    traceExporter: traceExporterConfig.exporter,
    instrumentations: [],
    metricReaders: [],
    logRecordProcessors: [],
  })

  telemetrySdk.start()

  logInfo('OpenTelemetry tracing started', {
    serviceName,
    serviceVersion,
    deploymentEnvironment,
    exporter: traceExporterConfig.name,
    endpoint: traceExporterConfig.endpoint ?? 'otel-env-or-default',
  })
}

function createTraceExporter(): TraceExporterConfig {
  return {
    exporter: new OTLPTraceExporter(),
    name: 'otlp-http',
    endpoint: getOptionalEnv('OTEL_EXPORTER_OTLP_TRACES_ENDPOINT')
      ?? getOptionalEnv('OTEL_EXPORTER_OTLP_ENDPOINT'),
  }
}

export async function shutdownTelemetry(signal: 'SIGTERM' | 'SIGINT'): Promise<void> {
  if (isShutdownStarted || !telemetrySdk) return

  isShutdownStarted = true

  try {
    await telemetrySdk.shutdown()
    logInfo('OpenTelemetry tracing stopped', { signal })
  } catch (error: unknown) {
    logError('Failed to shut down OpenTelemetry tracing', error, { signal })
    throw error
  }
}

