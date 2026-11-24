import * as PgDrizzle from '@lily/db/effect-drizzle'
import { rarePlantIdentifications } from '@lily/db/schema'
import type { StoredObjectRef } from '@lily/shared/services/file/stored-ref-mint'
import { and, eq, sql } from 'drizzle-orm'
import { Array, Context, Effect, Layer } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export interface RareIdentification {
  readonly userId: string
  readonly imageUrl: StoredObjectRef
}

/** A photo a client names by the URL its identify answered with. */
export interface RareIdentificationLookup {
  readonly userId: string
  readonly imageUrl: string
}

export interface IRareIdentificationRepository {
  readonly record: (
    identification: RareIdentification
  ) => Effect.Effect<void, SqlError>
  readonly exists: (
    lookup: RareIdentificationLookup
  ) => Effect.Effect<boolean, SqlError>
}

export class RareIdentificationRepository extends Context.Service<
  RareIdentificationRepository,
  IRareIdentificationRepository
>()('RareIdentificationRepository') {}

const matches = (lookup: RareIdentificationLookup) =>
  and(
    eq(rarePlantIdentifications.userId, lookup.userId),
    eq(rarePlantIdentifications.imageUrl, sql.param(lookup.imageUrl))
  )

export const RareIdentificationRepositoryLive = Layer.effect(
  RareIdentificationRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      record: Effect.fn('RareIdentificationRepository.record')(function* (
        identification: RareIdentification
      ) {
        yield* db
          .insert(rarePlantIdentifications)
          .values(identification)
          .onConflictDoNothing({
            target: [
              rarePlantIdentifications.userId,
              rarePlantIdentifications.imageUrl,
            ],
          })
      }),

      exists: Effect.fn('RareIdentificationRepository.exists')(function* (
        lookup: RareIdentificationLookup
      ) {
        const rows = yield* db
          .select({ id: rarePlantIdentifications.id })
          .from(rarePlantIdentifications)
          .where(matches(lookup))
          .limit(1)
        return Array.isArrayNonEmpty(rows)
      }),
    }
  })
)
