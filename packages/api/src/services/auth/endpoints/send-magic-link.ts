import { MagicLinkRepository } from '@lily/api/repositories/magic-link.repository'
import { sendMagicLinkEmail } from '@lily/api/services/email/send-magic-link'
import {
  RATE_LIMITS,
  RateLimiterService,
} from '@lily/api/services/rate-limiter/service'
import { nowAsDate } from '@lily/shared'
import type { MagicLinkRequest, MagicLinkSentResponse } from '@lily/shared/auth'
import {
  Config,
  type ConfigError,
  Console,
  Effect,
  String as EffectString,
  pipe,
} from 'effect'
import qrcode from 'qrcode-terminal'

// Feature flag - MUST be explicitly set in environment
// App will fail to start if not configured
const DisableMagicLinkVerification = Config.boolean(
  'DISABLE_MAGIC_LINK_VERIFICATION'
)

// 10 minutes expiry
const MAGIC_LINK_EXPIRY_MS = 10 * 60 * 1000

/**
 * Send magic link email to user
 */
export const sendMagicLink = ({
  email,
  language,
}: MagicLinkRequest): Effect.Effect<
  MagicLinkSentResponse,
  { message: string } | ConfigError.ConfigError,
  MagicLinkRepository | RateLimiterService
> =>
  Effect.gen(function* () {
    const magicLinkRepo = yield* MagicLinkRepository
    const rateLimiter = yield* RateLimiterService
    const disableVerification = yield* DisableMagicLinkVerification

    // Normalize email
    const normalizedEmail = pipe(
      email,
      EffectString.toLowerCase,
      EffectString.trim
    )

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(normalizedEmail) || normalizedEmail.length > 254) {
      return yield* Effect.fail({ message: 'Invalid email format' })
    }

    // Check rate limit
    yield* rateLimiter.checkRateLimit(
      `magic-link:${normalizedEmail}`,
      RATE_LIMITS.MAGIC_LINK
    )

    // Delete any existing magic links for this email
    yield* magicLinkRepo.deleteByEmail(normalizedEmail)

    // Generate secure token
    const token = crypto.randomUUID()
    const expiresAt = new Date(nowAsDate().getTime() + MAGIC_LINK_EXPIRY_MS)

    // Store magic link in database
    yield* magicLinkRepo.create(normalizedEmail, token, expiresAt)

    // Build callback URL for email
    const deepLink = `lily://verify?code=${token}`

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

    yield* Effect.catchAll(
      sendMagicLinkEmail({
        email: normalizedEmail,
        token,
        callbackUrl: `lily://verify?code=${token}`,
        language: language ?? 'en',
      }),
      () => Effect.succeed(undefined)
    )

    // Return generic success message (don't reveal if email exists)
    return { message: 'If an account exists, a magic link has been sent.' }
  }).pipe(Effect.withSpan('AuthService.sendMagicLink'))
