import { Schema } from 'effect'

const OpenAIErrorCodeSchema = Schema.Literals([
  'rate_limited',
  'authentication_failed',
  'bad_request',
  'not_found',
  'server_error',
  'unknown',
])

export type OpenAIErrorCode = Schema.Schema.Type<typeof OpenAIErrorCodeSchema>

export class OpenAIError extends Schema.TaggedError<
  OpenAIError,
  { readonly brand: unique symbol }
>()('OpenAIError', {
  code: OpenAIErrorCodeSchema,
  message: Schema.String,
  statusCode: Schema.optional(Schema.Finite),
}) {}

export class ConversationNotFoundError extends Schema.TaggedError<
  ConversationNotFoundError,
  { readonly brand: unique symbol }
>()('ConversationNotFoundError', { id: Schema.String }) {}
