import * as PgDrizzle from '@lily/db/effect-drizzle'
import { rarePlantIdentifications } from '@lily/db/schema'
import { and, eq } from 'drizzle-orm'
import { Array, Context, Effect, Layer } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export interface RareIdentification {
  readonly userId: string
  readonly imageUrl: string
}

export interface IRareIdentificationRepository {
  readonly record: (
    identification: RareIdentification
  ) => Effect.Effect<void, SqlError>
  readonly exists: (
    identification: RareIdentification
  ) => Effect.Effect<boolean, SqlError>
}

export class RareIdentificationRepository extends Context.Service<
  RareIdentificationRepository,
  IRareIdentificationRepository
>()('RareIdentificationRepository') {}

const matches = (identification: RareIdentification) =>
  and(
    eq(rarePlantIdentifications.userId, identification.userId),
    eq(rarePlantIdentifications.imageUrl, identification.imageUrl)
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
        identification: RareIdentification
      ) {
        const rows = yield* db
          .select({ id: rarePlantIdentifications.id })
          .from(rarePlantIdentifications)
          .where(matches(identification))
          .limit(1)
        return Array.isArrayNonEmpty(rows)
      }),
    }
  })
)
