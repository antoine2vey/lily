import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { magicLinks } from '@lily/db/schema/auth'
import { hoursAgoAsDate, nowAsDate } from '@lily/shared'
import { and, eq, isNull, lt } from 'drizzle-orm'
import {
  Array,
  Context,
  Effect,
  String as EffectString,
  Layer,
  Option,
  pipe,
} from 'effect'

/**
 * Magic link record type
 */
export type MagicLink = typeof magicLinks.$inferSelect

/**
 * Magic link repository interface
 */
export interface IMagicLinkRepository {
  readonly create: (
    email: string,
    token: string,
    expiresAt: Date
  ) => Effect.Effect<MagicLink | null, SqlError>
  readonly findByToken: (
    token: string
  ) => Effect.Effect<MagicLink | null, SqlError>
  readonly findValidByToken: (
    token: string
  ) => Effect.Effect<MagicLink | null, SqlError>
  readonly markUsed: (id: string) => Effect.Effect<MagicLink | null, SqlError>
  readonly deleteExpired: () => Effect.Effect<number, SqlError>
  readonly deleteByEmail: (email: string) => Effect.Effect<number, SqlError>
}

/**
 * Magic link repository context tag
 */
export class MagicLinkRepository extends Context.Tag('MagicLinkRepository')<
  MagicLinkRepository,
  IMagicLinkRepository
>() {}

/**
 * Live implementation of Magic Link Repository
 */
export const MagicLinkRepositoryLive = Layer.effect(
  MagicLinkRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      create: (email: string, token: string, expiresAt: Date) =>
        Effect.gen(function* () {
          const results = yield* db
            .insert(magicLinks)
            .values({
              email: pipe(email, EffectString.toLowerCase, EffectString.trim),
              token,
              expiresAt,
            })
            .returning()

          return pipe(results, Array.head, Option.getOrNull)
        }).pipe(Effect.withSpan('MagicLinkRepository.create')),

      findByToken: (token: string) =>
        Effect.gen(function* () {
          const results = yield* db
            .select()
            .from(magicLinks)
            .where(eq(magicLinks.token, token))

          return pipe(results, Array.head, Option.getOrNull)
        }).pipe(Effect.withSpan('MagicLinkRepository.findByToken')),

      findValidByToken: (token: string) =>
        Effect.gen(function* () {
          const currentTime = nowAsDate()
          const results = yield* db
            .select()
            .from(magicLinks)
            .where(
              and(
                eq(magicLinks.token, token),
                isNull(magicLinks.usedAt)
                // expiresAt > now (not expired)
              )
            )

          const record = pipe(results, Array.head, Option.getOrNull)

          // Check expiration manually since drizzle gt() can be tricky with dates
          if (record && record.expiresAt > currentTime) {
            return record
          }
          return null
        }).pipe(Effect.withSpan('MagicLinkRepository.findValidByToken')),

      markUsed: (id: string) =>
        Effect.gen(function* () {
          const results = yield* db
            .update(magicLinks)
            .set({
              usedAt: nowAsDate(),
            })
            .where(eq(magicLinks.id, id))
            .returning()

          return pipe(results, Array.head, Option.getOrNull)
        }).pipe(Effect.withSpan('MagicLinkRepository.markUsed')),

      deleteExpired: () =>
        Effect.gen(function* () {
          // Delete tokens older than 1 hour (expired + buffer for cleanup)
          const oneHourAgo = hoursAgoAsDate(1)
          const result = yield* db
            .delete(magicLinks)
            .where(lt(magicLinks.expiresAt, oneHourAgo))
            .returning()

          return result.length
        }).pipe(Effect.withSpan('MagicLinkRepository.deleteExpired')),

      deleteByEmail: (email: string) =>
        Effect.gen(function* () {
          const result = yield* db
            .delete(magicLinks)
            .where(
              eq(
                magicLinks.email,
                pipe(email, EffectString.toLowerCase, EffectString.trim)
              )
            )
            .returning()

          return result.length
        }).pipe(Effect.withSpan('MagicLinkRepository.deleteByEmail')),
    }
  })
)
