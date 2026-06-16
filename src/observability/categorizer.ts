import { SpanStatusCode, trace, type Attributes, type Span } from '@opentelemetry/api'
import type { AssistantMessage } from '@earendil-works/pi-ai'

import type { CategorizationResult } from '../services/categorizer/result'

const categorizerTracer = trace.getTracer('ai-email-categorizer')

export type CategorizerRunSpanInput = {
  source?: string
  provider: string
  requestedModel: string
  baseUrl?: string
  subject: string
  body: string
}

export function withCategorizerRunSpan<T>(
  input: CategorizerRunSpanInput,
  run: (span: Span) => Promise<T>,
): Promise<T> {
  return categorizerTracer.startActiveSpan('categorizer.run', {
    attributes: compactAttributes({
      'feature.name': 'categorizer',
      'categorizer.source': normalizeSource(input.source),
      'categorizer.provider': input.provider,
      'categorizer.request.model': input.requestedModel,
      'categorizer.base_url_host': getSafeBaseUrlHost(input.baseUrl),
      'categorizer.email.subject_length': input.subject.length,
      'gen_ai.operation.name': 'chat',
      'gen_ai.provider.name': input.provider,
      'gen_ai.request.model': input.requestedModel,
      'server.address': getSafeBaseUrlHost(input.baseUrl),
      'categorizer.email.body_length': input.body.length,
    }),
  }, async (span) => {
    try {
      return await run(span)
    } finally {
      span.end()
    }
  })
}

export function recordCategorizerModelResponse(span: Span, response: AssistantMessage): void {
  const hasModelError = response.stopReason === 'error' || Boolean(response.errorMessage)

  span.setAttributes(compactAttributes({
    'categorizer.response.provider': response.provider,
    'categorizer.response.model': response.responseModel ?? response.model,
    'categorizer.response.stop_reason': response.stopReason,
    'categorizer.response.content_block_count': response.content.length,
    'categorizer.model.error': hasModelError,
    'categorizer.usage.input_tokens': response.usage?.input,
    'categorizer.usage.output_tokens': response.usage?.output,
    'categorizer.usage.cache_read_tokens': response.usage?.cacheRead,
    'categorizer.usage.cache_write_tokens': response.usage?.cacheWrite,
    'categorizer.usage.total_tokens': response.usage?.totalTokens,
    'categorizer.usage.estimated_cost_usd': response.usage?.cost?.total,
    'gen_ai.provider.name': response.provider,
    'gen_ai.response.model': response.responseModel ?? response.model,
    'gen_ai.usage.input_tokens': response.usage?.input,
    'gen_ai.usage.output_tokens': response.usage?.output,
    'gen_ai.usage.total_tokens': response.usage?.totalTokens,
  }))

  if (hasModelError) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: 'Categorizer model returned an error',
    })
  }
}

export function recordCategorizerParsedResult(span: Span, result: CategorizationResult): void {
  span.setAttributes(compactAttributes({
    'categorizer.result.service_type_id': result.serviceTypeId,
    'categorizer.result.confidence_score': result.confidenceScore,
    'categorizer.result.should_alert_admin': result.shouldAlertAdmin,
    'categorizer.result.explanation_length': result.explanation.length,
    'categorizer.result.alert_reason_length': result.alertReason.length,
  }))
}

export function recordCategorizerParseError(span: Span, error: unknown): void {
  recordCategorizerError(span, error, 'Failed to parse categorizer response', {
    'categorizer.parse.error': true,
  })
}

export function recordCategorizerPromptError(span: Span, error: unknown): void {
  recordCategorizerError(span, error, 'Failed to build categorizer prompt', {
    'categorizer.prompt.error': true,
  })
}

export function recordCategorizerModelError(span: Span, error: unknown): void {
  recordCategorizerError(span, error, 'Categorizer model error', {
    'categorizer.model.error': true,
  })
}

function normalizeSource(source: string | undefined): string {
  const trimmed = source?.trim()
  return trimmed ? trimmed.slice(0, 64) : 'unknown'
}

function getSafeBaseUrlHost(baseUrl: string | undefined): string | undefined {
  const trimmed = baseUrl?.trim()
  if (!trimmed) return undefined

  try {
    return new URL(trimmed).host || undefined
  } catch {
    try {
      return new URL(`http://${trimmed}`).host || undefined
    } catch {
      return 'invalid'
    }
  }
}

function compactAttributes(attributes: Record<string, string | number | boolean | undefined>): Attributes {
  const compacted: Attributes = {}

  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined) continue
    if (typeof value === 'number' && !Number.isFinite(value)) continue
    compacted[key] = value
  }

  return compacted
}

function recordCategorizerError(
  span: Span,
  error: unknown,
  message: string,
  attributes: Record<string, boolean>,
): void {
  span.setAttributes(attributes)
  span.recordException(toError(error, message))
  span.setStatus({ code: SpanStatusCode.ERROR, message })
}

function toError(error: unknown, fallbackMessage: string): Error {
  return error instanceof Error ? error : new Error(fallbackMessage)
}
