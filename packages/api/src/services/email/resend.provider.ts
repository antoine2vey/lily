import {
  EmailConfigError,
  EmailSendError,
  EmailService,
  type IEmailService,
  type SendEmailRequest,
} from '@lily/shared'
import { Resend } from 'resend'
import { Effect, Layer } from 'effect'

// Environment configuration
interface ResendConfig {
  apiKey: string
  fromEmail: string
  fromName: string
}

const getConfig = (): Effect.Effect<ResendConfig, EmailConfigError> =>
  Effect.gen(function* () {
    const apiKey = process.env.RESEND_API_KEY
    const fromEmail = process.env.EMAIL_FROM_ADDRESS
    const fromName = process.env.EMAIL_FROM_NAME ?? 'Lily'

    if (!apiKey) {
      return yield* Effect.fail(
        new EmailConfigError({ message: 'RESEND_API_KEY is not configured' })
      )
    }

    if (!fromEmail) {
      return yield* Effect.fail(
        new EmailConfigError({
          message: 'EMAIL_FROM_ADDRESS is not configured',
        })
      )
    }

    return { apiKey, fromEmail, fromName }
  })

// Create the Resend email service implementation
const createResendService = (config: ResendConfig): IEmailService => {
  const resend = new Resend(config.apiKey)

  return {
    send: (request: SendEmailRequest) =>
      Effect.gen(function* () {
        const result = yield* Effect.tryPromise({
          try: () =>
            resend.emails.send({
              from: `${config.fromName} <${config.fromEmail}>`,
              to: request.to,
              subject: request.subject,
              html: request.html,
              ...(request.text !== undefined && { text: request.text }),
            }),
          catch: (error) =>
            new EmailSendError({
              message: 'Failed to send email',
              cause: error,
            }),
        })

        if (result.error) {
          return yield* Effect.fail(
            new EmailSendError({
              message: result.error.message,
              cause: result.error,
            })
          )
        }
      }),
  }
}

// Live layer for Resend email service
export const ResendEmailServiceLive = Layer.effect(
  EmailService,
  Effect.gen(function* () {
    const config = yield* getConfig()
    return createResendService(config)
  })
)
