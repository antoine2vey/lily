import { HttpServerRequest, HttpServerResponse } from '@effect/platform'
import { MagicLinkRepository } from '@lily/api/repositories/magic-link.repository'
import { sendMagicLinkEmail } from '@lily/api/services/email/send-magic-link'
import {
  RATE_LIMITS,
  RateLimiterService,
} from '@lily/api/services/rate-limiter/service'
import { MCP_SERVER_URL } from '@lily/mcp/config'
import {
  Console,
  DateTime,
  Duration,
  Effect,
  String as EffectString,
  pipe,
} from 'effect'

/**
 * Handles POST /confirm — email submission for magic link auth.
 *
 * Parses the email from form body, validates rate limits, creates a
 * magic link token, sends it via email, and returns a 200 success JSON.
 */
export const confirmHandler = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest
  const body = yield* request.text
  const form = new URLSearchParams(body)
  const url = new URL(request.url, MCP_SERVER_URL)
  const oauthParams = url.searchParams

  const email = form.get('email')
  if (!email) {
    return HttpServerResponse.unsafeJson(
      { error: 'Email is required' },
      { status: 400 }
    )
  }

  const normalizedEmail = pipe(
    email,
    EffectString.toLowerCase,
    EffectString.trim
  )

  // Rate limit check
  const rateLimiter = yield* RateLimiterService
  yield* rateLimiter.checkRateLimit(
    `mcp-magic-link:${normalizedEmail}`,
    RATE_LIMITS.MAGIC_LINK
  )

  // Generate magic link token
  const token = crypto.randomUUID()
  const expiresAt = DateTime.toDateUtc(
    DateTime.addDuration(DateTime.unsafeNow(), Duration.millis(10 * 60 * 1000))
  )

  // Store magic link
  const magicLinkRepo = yield* MagicLinkRepository
  yield* magicLinkRepo.deleteByEmail(normalizedEmail)
  yield* magicLinkRepo.create(normalizedEmail, token, expiresAt)

  // Build callback URL with OAuth params
  const callbackUrl = new URL(`${MCP_SERVER_URL}/verify`)
  callbackUrl.searchParams.set('code', token)
  for (const [key, value] of oauthParams.entries()) {
    callbackUrl.searchParams.set(key, value)
  }

  // In development, dump the verify link to console for easy testing
  if (process.env.NODE_ENV === 'development') {
    yield* Console.log(`\n${'='.repeat(50)}`)
    yield* Console.log('Verify link:')
    yield* Console.log(callbackUrl.toString())
    yield* Console.log(`${'='.repeat(50)}\n`)
  }

  // Send magic link email (log errors but don't fail the request)
  yield* sendMagicLinkEmail({
    email: normalizedEmail,
    token,
    callbackUrl: callbackUrl.toString(),
  }).pipe(
    Effect.catchAll((err) =>
      Effect.logError('Failed to send magic link email').pipe(
        Effect.annotateLogs('error', String(err)),
        Effect.annotateLogs('email', normalizedEmail)
      )
    )
  )

  return HttpServerResponse.unsafeJson({ message: 'Magic link sent' })
}).pipe(
  Effect.catchTag('RateLimitExceededError', () =>
    Effect.succeed(
      HttpServerResponse.unsafeJson(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      )
    )
  ),
  Effect.catchTag('SqlError', () =>
    Effect.succeed(
      HttpServerResponse.unsafeJson(
        { error: 'Request failed. Please try again.' },
        { status: 500 }
      )
    )
  ),
  Effect.withSpan('MCP.confirm')
)
