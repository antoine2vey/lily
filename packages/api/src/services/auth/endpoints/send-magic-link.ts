import { MagicLinkRepository } from '@lily/api/repositories/magic-link.repository'
import { sendMagicLinkEmail } from '@lily/api/services/email/send-magic-link'
import {
  RATE_LIMITS,
  RateLimiterService,
} from '@lily/api/services/rate-limiter/service'
import { nowAsDate } from '@lily/shared'
import type { MagicLinkRequest, MagicLinkSentResponse } from '@lily/shared/auth'
import { Console, Effect } from 'effect'
import qrcode from 'qrcode-terminal'

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
    const expiresAt = new Date(nowAsDate().getTime() + MAGIC_LINK_EXPIRY_MS)

    // Store magic link in database
    yield* magicLinkRepo.create(normalizedEmail, token, expiresAt)

    // Build callback URL for email
    const baseUrl = process.env.API_BASE_URL || 'http://192.168.1.85:3000'
    const callbackUrl = `${baseUrl}/api/auth/magic-link/callback?token=${token}`

    if (process.env.NODE_ENV === 'development') {
      // In development, print QR code to console for easy testing on physical device
      const deepLink = `lily://verify?code=${token}`

      yield* Console.log(`xcrun simctl openurl booted ${deepLink}`)

      yield* Effect.sync(() => {
        console.log(`\n${'='.repeat(50)}`)
        console.log('🔗 Magic Link Deep Link:')
        console.log(deepLink)
        console.log('='.repeat(50))
        console.log('\n📱 Scan this QR code with your device:\n')
        qrcode.generate(deepLink, { small: true })
        console.log(`${'='.repeat(50)}\n`)
      })
    } else if (process.env.NODE_ENV === 'production') {
      // In production, send the email
      yield* Effect.catchAll(
        sendMagicLinkEmail({
          email: normalizedEmail,
          token,
          callbackUrl,
          language: language ?? 'en',
        }),
        () => Effect.void
      )
    }

    // Return generic success message (don't reveal if email exists)
    return { message: 'If an account exists, a magic link has been sent.' }
  })
