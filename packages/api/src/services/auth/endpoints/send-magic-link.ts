import { spawn } from 'node:child_process'
import { MagicLinkRepository } from '@lily/api/repositories/magic-link.repository'
import { sendMagicLinkEmail } from '@lily/api/services/email/send-magic-link'
import {
  RATE_LIMITS,
  RateLimiterService,
} from '@lily/api/services/rate-limiter/service'
import type { MagicLinkRequest, MagicLinkSentResponse } from '@lily/shared/auth'
import { Effect } from 'effect'

// 10 minutes expiry
const MAGIC_LINK_EXPIRY_MS = 10 * 60 * 1000

/**
 * Send magic link email to user
 */
export const sendMagicLink = ({
  email,
}: MagicLinkRequest): Effect.Effect<
  MagicLinkSentResponse,
  { message: string },
  MagicLinkRepository | RateLimiterService
> =>
  Effect.gen(function* () {
    const magicLinkRepo = yield* MagicLinkRepository
    const rateLimiter = yield* RateLimiterService

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim()

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
    const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MS)

    // Store magic link in database
    yield* magicLinkRepo.create(normalizedEmail, token, expiresAt)

    // Build callback URL for email
    const baseUrl = process.env.API_BASE_URL || 'http://192.168.1.85:3000'
    const callbackUrl = `${baseUrl}/api/auth/magic-link/callback?token=${token}`

    if (process.env.NODE_ENV !== 'production') {
      // In development, open the magic link in the iOS simulator
      // Use detached spawn with sleep so response is sent before redirect
      const expoGoLink = `exp://192.168.1.85:8081/--/verify?code=${token}`
      const child = spawn(
        'sh',
        ['-c', `sleep 1 && xcrun simctl openurl booted '${expoGoLink}'`],
        { detached: true, stdio: 'ignore' }
      )
      child.unref()
    } else {
      // In production, send the email
      yield* Effect.catchAll(
        sendMagicLinkEmail({
          email: normalizedEmail,
          token,
          callbackUrl,
        }),
        (error) =>
          Effect.logError('Failed to send magic link email:', error).pipe(
            Effect.map(() => undefined)
          )
      )
    }

    // Return generic success message (don't reveal if email exists)
    return { message: 'If an account exists, a magic link has been sent.' }
  })
