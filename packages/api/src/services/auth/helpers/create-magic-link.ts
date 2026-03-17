import type { SqlError } from '@effect/sql/SqlError'
import { MagicLinkRepository } from '@lily/api/repositories/magic-link.repository'
import {
  DateTime,
  Duration,
  Effect,
  String as EffectString,
  pipe,
} from 'effect'

// 10 minutes expiry
export const MAGIC_LINK_EXPIRY_MS = 10 * 60 * 1000

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const normalizeEmail = (email: string) =>
  pipe(email, EffectString.toLowerCase, EffectString.trim)

export const validateEmail = (
  email: string
): Effect.Effect<void, { message: string }> =>
  EMAIL_REGEX.test(email) && email.length <= 254
    ? Effect.void
    : Effect.fail({ message: 'Invalid email format' })

export const createMagicLinkToken = (
  normalizedEmail: string
): Effect.Effect<
  { token: string; expiresAt: Date },
  SqlError,
  MagicLinkRepository
> =>
  Effect.gen(function* () {
    const magicLinkRepo = yield* MagicLinkRepository

    // Delete any existing magic links for this email
    yield* magicLinkRepo.deleteByEmail(normalizedEmail)

    // Generate secure token
    const token = crypto.randomUUID()
    const expiresAt = DateTime.toDateUtc(
      DateTime.addDuration(
        DateTime.unsafeNow(),
        Duration.millis(MAGIC_LINK_EXPIRY_MS)
      )
    )

    // Store magic link in database
    yield* magicLinkRepo.create(normalizedEmail, token, expiresAt)

    return { token, expiresAt }
  })
