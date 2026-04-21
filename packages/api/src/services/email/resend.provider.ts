import { Alerter, withProviderAlert } from '@lily/api/services/alerting'
import {
  EmailSendError,
  EmailService,
  type IEmailService,
  type SendEmailRequest,
} from '@lily/shared/server'
import { Config, Effect, Layer, Redacted } from 'effect'
import { Resend } from 'resend'

// Environment configuration using Effect Config
const ResendConfig = Config.all({
  apiKey: Config.redacted('RESEND_API_KEY'),
  fromEmail: Config.string('EMAIL_FROM_ADDRESS'),
  fromName: Config.string('EMAIL_FROM_NAME').pipe(Config.withDefault('Lily')),
})

// Live layer for Resend email service
export const ResendEmailServiceLive = Layer.effect(
  EmailService,
  Effect.gen(function* () {
    const config = yield* ResendConfig
    const alerter = yield* Alerter
    const resend = new Resend(Redacted.value(config.apiKey))
    const alert = withProviderAlert(alerter, { provider: 'resend' })

    const service: IEmailService = {
      send: (request: SendEmailRequest) =>
        Effect.gen(function* () {
          const result = yield* Effect.tryPromise({
            try: () =>
              resend.emails.send({
                from: `${config.fromName} <${config.fromEmail}>`,
                to: request.to,
                subject: request.subject,
                html: request.html,
                ...(request.text !== undefined ? { text: request.text } : {}),
              }),
            catch: (error) =>
              new EmailSendError({
                message: 'Failed to send email',
                cause: error,
              }),
          })

          if (result.error) {
            return yield* new EmailSendError({
              message: result.error.message,
              cause: result.error,
            })
          }
        }).pipe(alert),
    }

    return service
  })
)
