import {
  EmailSendError,
  EmailService,
  type IEmailService,
  type SendEmailRequest,
} from '@lily/shared/server'
import { Effect, Layer, Option, pipe } from 'effect'

export interface MockEmailServiceOptions {
  shouldFail?: boolean
  failureMessage?: string
}

// Track sent emails for verification in tests
let sentEmails: SendEmailRequest[] = []

export const createMockEmailService = (
  options: MockEmailServiceOptions = {}
): Layer.Layer<EmailService> => {
  // Reset sent emails
  sentEmails = []

  const service: IEmailService = {
    send: (request: SendEmailRequest) =>
      Effect.gen(function* () {
        if (options.shouldFail) {
          return yield* Effect.fail(
            new EmailSendError({
              message: pipe(
                Option.fromNullable(options.failureMessage),
                Option.getOrElse(() => 'Failed to send email')
              ),
            })
          )
        }

        // Track the sent email
        sentEmails.push(request)
      }),
  }

  return Layer.succeed(EmailService, service)
}

// Helper to get all sent emails
export const getSentEmails = () => [...sentEmails]

// Helper to get last sent email
export const getLastSentEmail = () =>
  sentEmails.length > 0 ? sentEmails[sentEmails.length - 1] : null

// Helper to clear sent emails
export const clearSentEmails = () => {
  sentEmails = []
}

// Helper to check if an email was sent to a specific address
export const wasEmailSentTo = (email: string) =>
  sentEmails.some((e) => e.to === email)
