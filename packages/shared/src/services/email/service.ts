import type {
  EmailConfigError,
  EmailSendError,
  SendEmailRequest,
} from '@lily/shared/services/email/types'
import { Context, type Effect } from 'effect'

// Email service interface - provider agnostic
export interface IEmailService {
  send: (
    request: SendEmailRequest
  ) => Effect.Effect<void, EmailSendError | EmailConfigError>
}

// Context tag for dependency injection
export class EmailService extends Context.Tag('EmailService')<
  EmailService,
  IEmailService
>() {}
