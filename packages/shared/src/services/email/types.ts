import { Schema } from 'effect'

// Email send request
export interface SendEmailRequest {
  to: string
  subject: string
  html: string
  text?: string
}

// Email service errors
export class EmailSendError extends Schema.TaggedError<EmailSendError>()(
  'EmailSendError',
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  }
) {}

export class EmailConfigError extends Schema.TaggedError<EmailConfigError>()(
  'EmailConfigError',
  {
    message: Schema.String,
  }
) {}
