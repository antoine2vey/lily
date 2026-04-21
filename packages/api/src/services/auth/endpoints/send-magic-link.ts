import type { MagicLinkRepository } from '@lily/api/repositories/magic-link.repository'
import { Alerter, logAndAlertWarning } from '@lily/api/services/alerting'
import { APP_VERIFY_DEEP_LINK_PREFIX } from '@lily/api/services/auth/constants'
import {
  createMagicLinkToken,
  normalizeEmail,
  validateEmail,
} from '@lily/api/services/auth/helpers/create-magic-link'
import { sendMagicLinkEmail } from '@lily/api/services/email/send-magic-link'
import {
  RATE_LIMITS,
  RateLimiterService,
} from '@lily/api/services/rate-limiter/service'
import type { MagicLinkRequest, MagicLinkSentResponse } from '@lily/shared/auth'
import type { EmailService } from '@lily/shared/server'
import { Config, Console, Context, Effect, Layer } from 'effect'
import qrcode from 'qrcode-terminal'

export class MagicLinkConfig extends Context.Tag('MagicLinkConfig')<
  MagicLinkConfig,
  { readonly disableVerification: boolean }
>() {}

export const MagicLinkConfigLive = Layer.effect(
  MagicLinkConfig,
  Effect.gen(function* () {
    const disableVerification = yield* Config.boolean(
      'DISABLE_MAGIC_LINK_VERIFICATION'
    )
    return { disableVerification }
  })
)

export const sendMagicLink = ({
  email,
  language,
}: MagicLinkRequest): Effect.Effect<
  MagicLinkSentResponse,
  { message: string },
  | MagicLinkRepository
  | RateLimiterService
  | MagicLinkConfig
  | EmailService
  | Alerter
> =>
  Effect.gen(function* () {
    const rateLimiter = yield* RateLimiterService
    const { disableVerification } = yield* MagicLinkConfig

    // Normalize email
    const normalized = normalizeEmail(email)

    // Validate email format
    yield* validateEmail(normalized)

    // Check rate limit
    yield* rateLimiter.checkRateLimit(
      `magic-link:${normalized}`,
      RATE_LIMITS.MAGIC_LINK
    )

    // Create magic link token
    const { token } = yield* createMagicLinkToken(normalized)

    // Build callback URL for email
    const deepLink = `${APP_VERIFY_DEEP_LINK_PREFIX}${token}`

    // If verification is disabled, skip email and return code for instant login
    // This is used for TestFlight/App Review testing
    if (disableVerification) {
      yield* Console.log(
        '⚠️ Magic link verification disabled - returning instant code'
      )
      return {
        message: 'If an account exists, a magic link has been sent.',
        instantCode: token,
      }
    }

    if (process.env.NODE_ENV === 'development') {
      // In development, print QR code to console for easy testing on physical device
      yield* Console.log(`xcrun simctl openurl booted ${deepLink}`)
      yield* Console.log(`\n${'='.repeat(50)}`)
      yield* Console.log('🔗 Magic Link Deep Link:')
      yield* Console.log('='.repeat(50))
      yield* Console.log('📱 Scan this QR code with your device:')
      qrcode.generate(deepLink, { small: true })
      yield* Console.log(`${'='.repeat(50)}\n`)
    }

    yield* sendMagicLinkEmail({
      email: normalized,
      token,
      callbackUrl: `${APP_VERIFY_DEEP_LINK_PREFIX}${token}`,
      language: language ?? 'en',
    }).pipe(
      Effect.catchTags({
        EmailSendError: (e) =>
          Effect.flatMap(Alerter, (alerter) =>
            logAndAlertWarning(
              alerter,
              'auth',
              'Magic link email send failed',
              {
                error: String(e).slice(0, 300),
              }
            )
          ),
        EmailConfigError: (e) =>
          Effect.flatMap(Alerter, (alerter) =>
            logAndAlertWarning(
              alerter,
              'auth',
              'Magic link email config error',
              { error: String(e).slice(0, 300) }
            )
          ),
        ConfigError: (e) =>
          Effect.logWarning('[auth] Magic link config error', {
            error: String(e),
          }),
      })
    )

    // Return generic success message (don't reveal if email exists)
    return { message: 'If an account exists, a magic link has been sent.' }
  }).pipe(Effect.withSpan('AuthService.sendMagicLink'))
