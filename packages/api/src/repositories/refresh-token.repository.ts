import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { refreshTokens } from '@lily/db/schema/auth'
import { daysAgoAsDate, nowAsDate } from '@lily/shared'
import { and, eq, isNull, lt } from 'drizzle-orm'
import { Array, Context, DateTime, Effect, Layer, Option, pipe } from 'effect'

/**
 * Refresh token record type
 */
export type RefreshToken = typeof refreshTokens.$inferSelect

/**
 * Refresh token repository interface
 */
export interface IRefreshTokenRepository {
  readonly create: (
    userId: string,
    tokenHash: string,
    expiresAt: Date
  ) => Effect.Effect<RefreshToken | null, SqlError>
  readonly findByTokenHash: (
    tokenHash: string
  ) => Effect.Effect<RefreshToken | null, SqlError>
  readonly findValidByTokenHash: (
    tokenHash: string,
    rotationGraceMs?: number
  ) => Effect.Effect<RefreshToken | null, SqlError>
  readonly revoke: (id: string) => Effect.Effect<RefreshToken | null, SqlError>
  readonly revokeAllForUser: (userId: string) => Effect.Effect<number, SqlError>
  readonly deleteExpiredAndRevoked: () => Effect.Effect<number, SqlError>
}

/**
 * Refresh token repository context tag
 */
export class RefreshTokenRepository extends Context.Tag(
  'RefreshTokenRepository'
)<RefreshTokenRepository, IRefreshTokenRepository>() {}

/**
 * Live implementation of Refresh Token Repository
 */
export const RefreshTokenRepositoryLive = Layer.effect(
  RefreshTokenRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      create: Effect.fn('RefreshTokenRepository.create')(function* (
        userId: string,
        tokenHash: string,
        expiresAt: Date
      ) {
        const results = yield* db
          .insert(refreshTokens)
          .values({
            userId,
            tokenHash,
            expiresAt,
          })
          .returning()

        return pipe(results, Array.head, Option.getOrNull)
      }),

      findByTokenHash: Effect.fn('RefreshTokenRepository.findByTokenHash')(
        function* (tokenHash: string) {
          const results = yield* db
            .select()
            .from(refreshTokens)
            .where(eq(refreshTokens.tokenHash, tokenHash))

          return pipe(results, Array.head, Option.getOrNull)
        }
      ),

      findValidByTokenHash: Effect.fn(
        'RefreshTokenRepository.findValidByTokenHash'
      )(function* (tokenHash: string, rotationGraceMs = 0) {
        const now = DateTime.unsafeMake(nowAsDate())
        const results = yield* db
          .select()
          .from(refreshTokens)
          .where(eq(refreshTokens.tokenHash, tokenHash))

        const record = pipe(results, Array.head, Option.getOrNull)

        if (!record) {
          return null
        }

        const notExpired = DateTime.greaterThan(
          DateTime.unsafeMake(record.expiresAt),
          now
        )

        // Active token, or one rotated so recently it's still inside the
        // grace window (covers concurrent refreshes racing on rotation)
        const notRevoked = pipe(
          Option.fromNullable(record.revokedAt),
          Option.match({
            onNone: () => true,
            onSome: (revokedAt) =>
              rotationGraceMs > 0 &&
              DateTime.distance(DateTime.unsafeMake(revokedAt), now) <=
                rotationGraceMs,
          })
        )

        if (notExpired && notRevoked) {
          return record
        }
        return null
      }),

      revoke: Effect.fn('RefreshTokenRepository.revoke')(function* (
        id: string
      ) {
        const results = yield* db
          .update(refreshTokens)
          .set({
            revokedAt: nowAsDate(),
          })
          .where(eq(refreshTokens.id, id))
          .returning()

        return pipe(results, Array.head, Option.getOrNull)
      }),

      revokeAllForUser: Effect.fn('RefreshTokenRepository.revokeAllForUser')(
        function* (userId: string) {
          const results = yield* db
            .update(refreshTokens)
            .set({
              revokedAt: nowAsDate(),
            })
            .where(
              and(
                eq(refreshTokens.userId, userId),
                isNull(refreshTokens.revokedAt)
              )
            )
            .returning()

          return results.length
        }
      ),

      deleteExpiredAndRevoked: Effect.fn(
        'RefreshTokenRepository.deleteExpiredAndRevoked'
      )(function* () {
        // Delete revoked tokens older than 30 days
        const thirtyDaysAgo = daysAgoAsDate(30)
        const result = yield* db
          .delete(refreshTokens)
          .where(lt(refreshTokens.createdAt, thirtyDaysAgo))
          .returning()

        return result.length
      }),
    }
  })
)
