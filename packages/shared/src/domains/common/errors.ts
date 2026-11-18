import { Schema } from 'effect'

/**
 * Typed error for failures when calling external HTTP services.
 *
 * Used by MCP (lily-api calls) and potentially by API (weather, payment
 * providers). Keeps HTTP failures in the typed error channel so they
 * can be matched with `catchTag('ExternalServiceError', ...)`.
 */
export class ExternalServiceError extends Schema.TaggedError<
  ExternalServiceError,
  { readonly brand: unique symbol }
>()('ExternalServiceError', {
  service: Schema.String,
  method: Schema.String,
  url: Schema.String,
  statusCode: Schema.optionalKey(Schema.Finite),
  message: Schema.String,
}) {}

/**
 * A dependency the request needs (the database) is unreachable. Declared on
 * the auth middleware so an outage answers 503 instead of telling signed-in
 * clients their credentials are invalid.
 */
export class ServiceUnavailableError extends Schema.TaggedError<
  ServiceUnavailableError,
  { readonly brand: unique symbol }
>()(
  'ServiceUnavailableError',
  {
    message: Schema.String,
  },
  { httpApiStatus: 503 }
) {}
