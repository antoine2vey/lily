import { Schema } from 'effect'

/**
 * Typed error for failures when calling external HTTP services.
 *
 * Used by MCP (lily-api calls) and potentially by API (weather, payment
 * providers). Keeps HTTP failures in the typed error channel so they
 * can be matched with `catchTag('ExternalServiceError', ...)`.
 */
export class ExternalServiceError extends Schema.TaggedError<ExternalServiceError>()(
  'ExternalServiceError',
  {
    service: Schema.String,
    method: Schema.String,
    url: Schema.String,
    statusCode: Schema.optionalWith(Schema.Number, { exact: true }),
    message: Schema.String,
  }
) {}
