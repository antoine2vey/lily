import { Alerter, withProviderAlert } from '@lily/api/services/alerting'
import {
  EmailSendError,
  EmailService,
  type IEmailService,
  type SendEmailRequest,
} from '@lily/shared/server'
import { Config, Duration, Effect, Layer, Redacted } from 'effect'
import { type CreateEmailRequestOptions, Resend } from 'resend'

// AuthService.sendMagicLink, which includes this call, ran p50 0.23 s and at
// most 0.47 s over the 60 days to 2026-10-19.
const RESEND_SEND_TIMEOUT = Duration.seconds(10)

// Environment configuration using Effect Config
const ResendConfig = Config.all({
  apiKey: Config.Redacted('RESEND_API_KEY'),
  fromEmail: Config.String('EMAIL_FROM_ADDRESS'),
  fromName: Config.String('EMAIL_FROM_NAME').pipe(Config.withDefault('Lily')),
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
            try: (signal) => {
              // Resend spreads request options into fetch's RequestInit, so
              // the signal reaches fetch even though its type omits it.
              const options: CreateEmailRequestOptions &
                Pick<RequestInit, 'signal'> = { signal }
              return resend.emails.send(
                {
                  from: `${config.fromName} <${config.fromEmail}>`,
                  to: request.to,
                  subject: request.subject,
                  html: request.html,
                  ...(request.text !== undefined ? { text: request.text } : {}),
                },
                options
              )
            },
            catch: (error) =>
              new EmailSendError({
                message: 'Failed to send email',
                cause: error,
              }),
          }).pipe(
            Effect.timeoutOrElse({
              duration: RESEND_SEND_TIMEOUT,
              orElse: () =>
                Effect.fail(
                  new EmailSendError({
                    message: `No response from Resend within ${Duration.format(RESEND_SEND_TIMEOUT)}`,
                  })
                ),
            })
          )

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
