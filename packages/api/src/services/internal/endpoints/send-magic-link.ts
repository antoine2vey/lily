import type { MagicLinkRepository } from '@lily/api/repositories/magic-link.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
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
import type { LanguageCode } from '@lily/shared'
import type { EmailService } from '@lily/shared/server'
import { Console, Effect } from 'effect'

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
  language?: LanguageCode | undefined
}): Effect.Effect<
  { message: string },
  { message: string },
  MagicLinkRepository | RateLimiterService | UserRepository | EmailService
> =>
  Effect.gen(function* () {
    const rateLimiter = yield* RateLimiterService
    const userRepo = yield* UserRepository

    const normalized = normalizeEmail(input.email)

    // Validate email format
    yield* validateEmail(normalized)

    // Silently succeed for unknown emails to prevent email enumeration
    const existingUser = yield* userRepo.findByEmail(normalized)
    if (!existingUser) {
      return { message: 'Magic link sent' }
    }

    // Rate limit
    yield* rateLimiter.checkRateLimit(
      `magic-link:${normalized}`,
      RATE_LIMITS.MAGIC_LINK
    )

    // Create magic link token
    const { token } = yield* createMagicLinkToken(normalized)

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
      email: normalized,
      token,
      callbackUrl: fullCallbackUrl,
      language: input.language ?? 'en',
    }).pipe(
      Effect.catchTags({
        EmailSendError: (e) =>
          Effect.logWarning('[internal] Magic link email send failed', {
            email: normalized,
            error: String(e),
          }),
        EmailConfigError: (e) =>
          Effect.logWarning('[internal] Magic link email config error', {
            email: normalized,
            error: String(e),
          }),
        ConfigError: (e) =>
          Effect.logWarning('[internal] Magic link config error', {
            email: normalized,
            error: String(e),
          }),
      })
    )

    return { message: 'Magic link sent' }
  }).pipe(Effect.withSpan('InternalService.sendMagicLink'))
