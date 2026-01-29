import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { refreshTokens } from '@lily/db/schema/auth'
import { daysAgoAsDate, nowAsDate } from '@lily/shared'
import { and, eq, isNull, lt } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'

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
    tokenHash: string
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
      create: (userId: string, tokenHash: string, expiresAt: Date) =>
        Effect.gen(function* () {
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

      findByTokenHash: (tokenHash: string) =>
        Effect.gen(function* () {
          const results = yield* db
            .select()
            .from(refreshTokens)
            .where(eq(refreshTokens.tokenHash, tokenHash))

          return pipe(results, Array.head, Option.getOrNull)
        }),

      findValidByTokenHash: (tokenHash: string) =>
        Effect.gen(function* () {
          const currentTime = nowAsDate()
          const results = yield* db
            .select()
            .from(refreshTokens)
            .where(
              and(
                eq(refreshTokens.tokenHash, tokenHash),
                isNull(refreshTokens.revokedAt)
              )
            )

          const record = pipe(results, Array.head, Option.getOrNull)

          // Check expiration manually
          if (record && record.expiresAt > currentTime) {
            return record
          }
          return null
        }),

      revoke: (id: string) =>
        Effect.gen(function* () {
          const results = yield* db
            .update(refreshTokens)
            .set({
              revokedAt: nowAsDate(),
            })
            .where(eq(refreshTokens.id, id))
            .returning()

          return pipe(results, Array.head, Option.getOrNull)
        }),

      revokeAllForUser: (userId: string) =>
        Effect.gen(function* () {
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
        }),

      deleteExpiredAndRevoked: () =>
        Effect.gen(function* () {
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
