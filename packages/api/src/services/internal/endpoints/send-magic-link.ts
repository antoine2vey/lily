import { MagicLinkRepository } from '@lily/api/repositories/magic-link.repository'
import { sendMagicLinkEmail } from '@lily/api/services/email/send-magic-link'
import {
  RATE_LIMITS,
  RateLimiterService,
} from '@lily/api/services/rate-limiter/service'
import {
  Console,
  DateTime,
  Duration,
  Effect,
  String as EffectString,
  pipe,
} from 'effect'

const MAGIC_LINK_EXPIRY_MS = 10 * 60 * 1000

/**
 * Sends a magic link email with a custom callback URL.
 *
 * Called by the MCP server to initiate the login flow. The callback URL
 * points back to the MCP's /verify endpoint with OAuth params appended,
 * so when the user clicks the link they return to MCP's OAuth flow.
 *
 * Security: Only callable with valid service secret — the callback URL
 * is not user-controlled since this endpoint is behind ServiceAuthentication.
 */
export const sendInternalMagicLink = (input: {
  email: string
  callbackUrl: string
  language?: 'en' | 'fr' | undefined
}): Effect.Effect<
  { message: string },
  { message: string },
  MagicLinkRepository | RateLimiterService
> =>
  Effect.gen(function* () {
    const magicLinkRepo = yield* MagicLinkRepository
    const rateLimiter = yield* RateLimiterService

    const normalizedEmail = pipe(
      input.email,
      EffectString.toLowerCase,
      EffectString.trim
    )

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(normalizedEmail) || normalizedEmail.length > 254) {
      return yield* Effect.fail({ message: 'Invalid email format' })
    }

    // Rate limit
    yield* rateLimiter.checkRateLimit(
      `magic-link:${normalizedEmail}`,
      RATE_LIMITS.MAGIC_LINK
    )

    // Delete existing and create new
    yield* magicLinkRepo.deleteByEmail(normalizedEmail)

    const token = crypto.randomUUID()
    const expiresAt = DateTime.toDateUtc(
      DateTime.addDuration(
        DateTime.unsafeNow(),
        Duration.millis(MAGIC_LINK_EXPIRY_MS)
      )
    )

    yield* magicLinkRepo.create(normalizedEmail, token, expiresAt)

    // Build the full callback URL with the token
    const fullCallbackUrl = input.callbackUrl.includes('?')
      ? `${input.callbackUrl}&code=${token}`
      : `${input.callbackUrl}?code=${token}`

    if (process.env.NODE_ENV === 'development') {
      yield* Console.log(`\n${'='.repeat(50)}`)
      yield* Console.log('Internal magic link:')
      yield* Console.log(fullCallbackUrl)
      yield* Console.log(`${'='.repeat(50)}\n`)
    }

    // Send email (swallow errors to prevent email enumeration)
    yield* sendMagicLinkEmail({
      email: normalizedEmail,
      token,
      callbackUrl: fullCallbackUrl,
      language: input.language ?? 'en',
    }).pipe(
      Effect.catchAll((err) =>
        Effect.logError('Failed to send magic link email').pipe(
          Effect.annotateLogs('error', String(err)),
          Effect.annotateLogs('email', normalizedEmail)
        )
      )
    )

    return { message: 'Magic link sent' }
  }).pipe(Effect.withSpan('InternalService.sendMagicLink'))
