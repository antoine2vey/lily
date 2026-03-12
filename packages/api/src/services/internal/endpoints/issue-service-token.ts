import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { MagicLinkRepository } from '@lily/api/repositories/magic-link.repository'
import { RefreshTokenRepository } from '@lily/api/repositories/refresh-token.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import {
  ACCESS_TOKEN_EXPIRY_SECONDS,
  REFRESH_TOKEN_EXPIRY_MS,
} from '@lily/api/services/auth/constants'
import { JWTService } from '@lily/api/services/jwt/service'
import { users } from '@lily/db/schema/users'
import { nowAsDate } from '@lily/shared'
import type { AuthResponse } from '@lily/shared/auth'
import { eq } from 'drizzle-orm'
import { Array, DateTime, Duration, Effect, Option, pipe } from 'effect'

/**
 * Issues a service token (JWT) for a user identified by email or magic link code.
 *
 * Two modes:
 * - `{ magicLinkCode }`: Validates + consumes the magic link, resolves email, issues JWT
 *
 * This is the core of the MCP → API auth bridge: the MCP server calls this
 * after a user completes the OAuth consent flow to obtain an API JWT.
 */
export const issueServiceToken = (input: {
  magicLinkCode: string
}): Effect.Effect<
  AuthResponse,
  { message: string },
  | MagicLinkRepository
  | RefreshTokenRepository
  | UserRepository
  | JWTService
  | PgDrizzle.PgDrizzle
> =>
  Effect.gen(function* () {
    const userRepo = yield* UserRepository
    const refreshTokenRepo = yield* RefreshTokenRepository
    const jwtService = yield* JWTService
    const db = yield* PgDrizzle.PgDrizzle

    // Resolve email: either directly provided or via magic link code
    const email: string = yield* resolveEmail(input)

    // Find or create user
    const existingUser = yield* userRepo.findByEmail(email)
    const user = yield* pipe(
      Option.fromNullable(existingUser),
      Option.match({
        onNone: () =>
          Effect.gen(function* () {
            const created = yield* db
              .insert(users)
              .values({
                email,
                emailVerified: true,
              })
              .returning()
            return pipe(created, Array.head, Option.getOrNull)
          }),
        onSome: (existing) =>
          Effect.gen(function* () {
            if (existing.emailVerified) return existing

            const updated = yield* db
              .update(users)
              .set({
                emailVerified: true,
                updatedAt: nowAsDate(),
              })
              .where(eq(users.id, existing.id))
              .returning()

            return pipe(
              updated,
              Array.head,
              Option.getOrElse(() => existing)
            )
          }),
      })
    )

    if (!user) {
      return yield* Effect.fail({ message: 'Failed to create user' })
    }

    if (user.status !== 'active') {
      return yield* Effect.fail({ message: `Account is ${user.status}` })
    }

    // Generate JWT access token
    const accessToken = yield* jwtService.signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
    })

    // Generate refresh token
    const refreshToken = yield* jwtService.generateRefreshToken()
    const refreshTokenHash = yield* jwtService.hashRefreshToken(refreshToken)
    const refreshTokenExpiry = DateTime.toDateUtc(
      DateTime.addDuration(
        DateTime.unsafeNow(),
        Duration.millis(REFRESH_TOKEN_EXPIRY_MS)
      )
    )

    yield* refreshTokenRepo.create(
      user.id,
      refreshTokenHash,
      refreshTokenExpiry
    )

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.name || undefined,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        role: user.role,
        status: user.status,
      },
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
    }
  }).pipe(Effect.withSpan('InternalService.issueServiceToken'))

/**
 * Resolves the email from input: either directly or by consuming a magic link code.
 */
const resolveEmail = (input: {
  magicLinkCode: string
}): Effect.Effect<string, { message: string }, MagicLinkRepository> =>
  Effect.gen(function* () {
    const magicLinkRepo = yield* MagicLinkRepository
    const magicLink = yield* magicLinkRepo.findValidAndMarkUsed(
      input.magicLinkCode
    )

    if (!magicLink) {
      return yield* Effect.fail({ message: 'Invalid or expired magic link' })
    }

    return magicLink.email
  })
