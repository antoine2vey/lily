import { APICallError, RetryError } from 'ai'
import { Match, Option, Schema } from 'effect'

// ── OpenAI error codes ─────────────────────────────────────────────

const OpenAIErrorCodeSchema = Schema.Literal(
  'rate_limited',
  'authentication_failed',
  'bad_request',
  'not_found',
  'server_error',
  'unknown'
)

export type OpenAIErrorCode = Schema.Schema.Type<typeof OpenAIErrorCodeSchema>

// ── OpenAI error ───────────────────────────────────────────────────

export class OpenAIError extends Schema.TaggedError<OpenAIError>()(
  'OpenAIError',
  {
    code: OpenAIErrorCodeSchema,
    message: Schema.String,
    statusCode: Schema.optional(Schema.Number),
  }
) {}

// ── Helper: unwrap AI SDK error → typed Effect error ───────────────

const extractAPICallError = (error: unknown): APICallError | undefined => {
  if (APICallError.isInstance(error)) return error
  if (RetryError.isInstance(error)) {
    if (APICallError.isInstance(error.lastError)) return error.lastError
  }
  return undefined
}

const resolveCode = (
  apiError: APICallError
): { code: OpenAIErrorCode; label: string } => {
  const status = apiError.statusCode

  const code: OpenAIErrorCode = Match.value(status).pipe(
    Match.when(401, () => 'authentication_failed' as const),
    Match.when(400, () => 'bad_request' as const),
    Match.when(404, () => 'not_found' as const),
    Match.when(429, () => 'rate_limited' as const),
    Match.orElse(() =>
      Option.match(Option.fromNullable(status), {
        onNone: () => 'unknown' as const,
        onSome: (s) =>
          s >= 500 ? ('server_error' as const) : ('unknown' as const),
      })
    )
  )

  const label = Match.value(code).pipe(
    Match.when(
      'authentication_failed',
      () => 'Invalid API key or authentication failed'
    ),
    Match.when('bad_request', () => `Bad request — ${apiError.message}`),
    Match.when('not_found', () => 'Model or resource not found'),
    Match.when('rate_limited', () => 'Rate limited or quota exceeded'),
    Match.when('server_error', () => `OpenAI server error (HTTP ${status})`),
    Match.when(
      'unknown',
      () =>
        `Unexpected error (HTTP ${status ?? 'unknown'}) — ${apiError.message}`
    ),
    Match.exhaustive
  )

  return { code, label }
}

export const mapOpenAIError =
  (context: string) =>
  (error: unknown): OpenAIError => {
    const apiError = extractAPICallError(error)

    if (apiError == null) {
      return new OpenAIError({
        code: 'unknown',
        message: `${context}: ${error instanceof Error ? error.message : String(error)}`,
      })
    }

    const { code, label } = resolveCode(apiError)
    return new OpenAIError({
      code,
      statusCode: apiError.statusCode,
      message: `${context}: ${label}`,
    })
  }
