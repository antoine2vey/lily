import { Schema } from 'effect'

export interface SendEmailRequest {
  to: string
  subject: string
  html: string
  text?: string
}

export class EmailSendError extends Schema.TaggedError<
  EmailSendError,
  { readonly brand: unique symbol }
>()('EmailSendError', {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

export class EmailConfigError extends Schema.TaggedError<
  EmailConfigError,
  { readonly brand: unique symbol }
>()('EmailConfigError', {
  message: Schema.String,
}) {}
