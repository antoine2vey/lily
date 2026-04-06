import {
  EmailService,
  type IEmailService,
  type SendEmailRequest,
} from '@lily/shared/server'
import { Effect, Layer } from 'effect'

export const ConsoleEmailServiceLive = Layer.succeed(
  EmailService,
  EmailService.of({
    send: (request: SendEmailRequest) =>
      Effect.log(
        `[DEV] Email → ${request.to}\n  subject: ${request.subject}\n  body: ${request.text ?? request.html.slice(0, 200)}`
      ),
  } satisfies IEmailService)
)
