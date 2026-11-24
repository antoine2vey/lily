import {
  EmailService,
  type IEmailService,
} from '@lily/api/services/email/service'
import {
  EmailSendError,
  type SendEmailRequest,
} from '@lily/api/services/email/types'
import { Effect, Layer, Option, pipe } from 'effect'

export interface MockEmailServiceOptions {
  shouldFail?: boolean
  failureMessage?: string
}

let sentEmails: SendEmailRequest[] = []

export const createMockEmailService = (
  options: MockEmailServiceOptions = {}
): Layer.Layer<EmailService> => {
  sentEmails = []

  const service: IEmailService = {
    send: (request: SendEmailRequest) =>
      Effect.gen(function* () {
        if (options.shouldFail) {
          return yield* new EmailSendError({
            message: pipe(
              Option.fromNullishOr(options.failureMessage),
              Option.getOrElse(() => 'Failed to send email')
            ),
          })
        }

        sentEmails.push(request)
      }),
  }

  return Layer.succeed(EmailService, service)
}

export const getSentEmails = () => [...sentEmails]

export const getLastSentEmail = () =>
  sentEmails.length > 0 ? sentEmails[sentEmails.length - 1] : null

export const clearSentEmails = () => {
  sentEmails = []
}

export const wasEmailSentTo = (email: string) =>
  sentEmails.some((e) => e.to === email)
