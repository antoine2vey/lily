import { APP_VERIFY_DEEP_LINK_PREFIX } from '@lily/api/services/auth/constants'
import type { LanguageCode } from '@lily/shared'
import { EmailService } from '@lily/shared/server'
import type {
  EmailConfigError,
  EmailSendError,
} from '@lily/shared/services/email/types'
import { Effect, Match, pipe } from 'effect'
import type { ConfigError } from 'effect/ConfigError'

interface SendMagicLinkEmailRequest {
  email: string
  token: string
  callbackUrl: string
  language?: LanguageCode
}

interface EmailContent {
  subject: string
  title: string
  description: string
  buttonText: string
  ignoreNotice: string
  expiryNotice: string
  fallbackNotice: string
}

const getEmailContent = (language: LanguageCode): EmailContent =>
  pipe(
    Match.value(language),
    Match.when('fr', () => ({
      subject: 'Connexion à Lily',
      title: 'Connexion à Lily',
      description:
        'Cliquez sur le bouton ci-dessous pour vous connecter à votre compte. Ce lien expirera dans 10 minutes.',
      buttonText: 'Se connecter à Lily',
      ignoreNotice:
        "Si vous n'avez pas demandé cet e-mail, vous pouvez l'ignorer en toute sécurité.",
      expiryNotice:
        'Ce lien expirera dans 10 minutes. Si le bouton ne fonctionne pas, copiez et collez cette URL dans votre navigateur :',
      fallbackNotice: "Ou utilisez ce code dans l'application :",
    })),
    Match.when('en', () => ({
      subject: 'Sign in to Lily',
      title: 'Sign in to Lily',
      description:
        'Click the button below to sign in to your account. This link will expire in 10 minutes.',
      buttonText: 'Sign in to Lily',
      ignoreNotice:
        "If you didn't request this email, you can safely ignore it.",
      expiryNotice:
        "This link will expire in 10 minutes. If the button doesn't work, copy and paste this URL into your browser:",
      fallbackNotice: 'Or use this code in the app:',
    })),
    Match.exhaustive
  )

/**
 * Send magic link email to user
 * Uses the browser callback URL which will redirect to the app
 */
export const sendMagicLinkEmail = ({
  email,
  token,
  callbackUrl,
  language = 'en',
}: SendMagicLinkEmailRequest): Effect.Effect<
  void,
  EmailSendError | EmailConfigError | ConfigError,
  EmailService
> => {
  // Create deep link URL for the mobile app (fallback shown in email)
  const appDeepLink = `${APP_VERIFY_DEEP_LINK_PREFIX}${token}`
  const content = getEmailContent(language)

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${content.title}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px; background-color: #f5f5f5;">
        <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <h1 style="color: #2d5a27; margin: 0 0 24px 0; font-size: 24px;">${content.title}</h1>
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
            ${content.description}
          </p>
          <a href="${callbackUrl}" style="display: inline-block; background-color: #2d5a27; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
            ${content.buttonText}
          </a>
          <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 24px 0 0 0;">
            ${content.ignoreNotice}
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;">
          <p style="color: #999; font-size: 12px; margin: 0;">
            ${content.expiryNotice}
          </p>
          <p style="color: #666; font-size: 12px; word-break: break-all; margin: 8px 0 0 0;">
            ${appDeepLink}
          </p>
        </div>
      </body>
    </html>
  `

  const text = `${content.title}\n\n${content.description}\n\n${callbackUrl}\n\n${content.ignoreNotice}`

  return Effect.gen(function* () {
    const emailService = yield* EmailService
    yield* emailService.send({
      to: email,
      subject: content.subject,
      html,
      text,
    })
  })
}
