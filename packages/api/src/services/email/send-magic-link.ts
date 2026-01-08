import { ResendEmailServiceLive } from '@lily/api/services/email/resend.provider'
import { EmailService } from '@lily/shared'
import { Effect } from 'effect'

interface MagicLinkRequest {
  email: string
  token: string
  url: string
}

// Bridge function for Better Auth's sendMagicLink callback
export const sendMagicLinkEmail = async (
  request: MagicLinkRequest
): Promise<void> => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Sign in to Lily</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px; background-color: #f5f5f5;">
        <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <h1 style="color: #2d5a27; margin: 0 0 24px 0; font-size: 24px;">Sign in to Lily</h1>
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
            Click the button below to sign in to your account. This link will expire in 10 minutes.
          </p>
          <a href="${request.url}" style="display: inline-block; background-color: #2d5a27; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
            Sign in to Lily
          </a>
          <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 24px 0 0 0;">
            If you didn't request this email, you can safely ignore it.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;">
          <p style="color: #999; font-size: 12px; margin: 0;">
            This link will expire in 10 minutes. If the button doesn't work, copy and paste this URL into your browser:
          </p>
          <p style="color: #666; font-size: 12px; word-break: break-all; margin: 8px 0 0 0;">
            ${request.url}
          </p>
        </div>
      </body>
    </html>
  `

  const text = `Sign in to Lily\n\nClick this link to sign in: ${request.url}\n\nThis link will expire in 10 minutes.\n\nIf you didn't request this email, you can safely ignore it.`

  const program = Effect.gen(function* () {
    const emailService = yield* EmailService
    yield* emailService.send({
      to: request.email,
      subject: 'Sign in to Lily',
      html,
      text,
    })
  }).pipe(Effect.provide(ResendEmailServiceLive))

  await Effect.runPromise(program)
}
