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

export class EmailService extends Context.Service<
  EmailService,
  IEmailService
>()('EmailService') {}
