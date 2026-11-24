import * as PgDrizzle from '@lily/db/effect-drizzle'
import { magicLinks } from '@lily/db/schema/auth'
import { hoursAgoAsDate, nowAsDate } from '@lily/shared'
import { and, eq, gt, isNotNull, isNull, lt, or } from 'drizzle-orm'
import {
  Array,
  Context,
  DateTime,
  Effect,
  String as EffectString,
  Layer,
  Option,
  pipe,
} from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export type MagicLink = typeof magicLinks.$inferSelect

export interface IMagicLinkRepository {
  readonly create: (
    email: string,
    token: string,
    expiresAt: Date
  ) => Effect.Effect<MagicLink | null, SqlError>
  readonly findValidByToken: (
    token: string
  ) => Effect.Effect<MagicLink | null, SqlError>
  readonly findValidAndMarkUsed: (
    token: string
  ) => Effect.Effect<MagicLink | null, SqlError>
  readonly deleteExpired: Effect.Effect<number, SqlError>
  /** Deletes the address's used and expired links; live ones stay valid. */
  readonly deleteSpentByEmail: (
    email: string
  ) => Effect.Effect<number, SqlError>
}

export class MagicLinkRepository extends Context.Service<
  MagicLinkRepository,
  IMagicLinkRepository
>()('MagicLinkRepository') {}

export const MagicLinkRepositoryLive = Layer.effect(
  MagicLinkRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      create: Effect.fn('MagicLinkRepository.create')(function* (
        email: string,
        token: string,
        expiresAt: Date
      ) {
        const results = yield* db
          .insert(magicLinks)
          .values({
            email: pipe(email, EffectString.toLowerCase, EffectString.trim),
            token,
            expiresAt,
          })
          .returning()

        return pipe(results, Array.head, Option.getOrNull)
      }),

      findValidByToken: Effect.fn('MagicLinkRepository.findValidByToken')(
        function* (token: string) {
          const currentTime = nowAsDate()
          const results = yield* db
            .select()
            .from(magicLinks)
            .where(and(eq(magicLinks.token, token), isNull(magicLinks.usedAt)))

          const record = pipe(results, Array.head, Option.getOrNull)

          if (
            record &&
            DateTime.isGreaterThan(
              DateTime.makeUnsafe(record.expiresAt),
              DateTime.makeUnsafe(currentTime)
            )
          ) {
            return record
          }
          return null
        }
      ),

      findValidAndMarkUsed: Effect.fn(
        'MagicLinkRepository.findValidAndMarkUsed'
      )(function* (token: string) {
        const currentTime = nowAsDate()
        // Atomic: UPDATE WHERE token=? AND used_at IS NULL AND expires_at > now
        // This prevents TOCTOU race conditions
        const results = yield* db
          .update(magicLinks)
          .set({ usedAt: currentTime })
          .where(
            and(
              eq(magicLinks.token, token),
              isNull(magicLinks.usedAt),
              gt(magicLinks.expiresAt, currentTime)
            )
          )
          .returning()

        return pipe(results, Array.head, Option.getOrNull)
      }),

      deleteExpired: Effect.gen(function* () {
        const oneHourAgo = hoursAgoAsDate(1)
        const result = yield* db
          .delete(magicLinks)
          .where(lt(magicLinks.expiresAt, oneHourAgo))
          .returning({ id: magicLinks.id })

        return result.length
      }).pipe(Effect.withSpan('MagicLinkRepository.deleteExpired')),

      deleteSpentByEmail: Effect.fn('MagicLinkRepository.deleteSpentByEmail')(
        function* (email: string) {
          const result = yield* db
            .delete(magicLinks)
            .where(
              and(
                eq(
                  magicLinks.email,
                  pipe(email, EffectString.toLowerCase, EffectString.trim)
                ),
                or(
                  isNotNull(magicLinks.usedAt),
                  lt(magicLinks.expiresAt, nowAsDate())
                )
              )
            )
            .returning()

          return result.length
        }
      ),
    }
  })
)
