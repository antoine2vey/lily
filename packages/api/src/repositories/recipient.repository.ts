import {
  audienceByPlant,
  plantAudience,
} from '@lily/api/repositories/helpers/recipient'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import { plants } from '@lily/db/schema'
import { asc, inArray } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export interface IRecipientRepository {
  readonly audienceOf: (
    plantIds: ReadonlyArray<string>
  ) => Effect.Effect<Audience, SqlError>
}

export type Audience = ReadonlyMap<string, ReadonlyArray<string>>

export const heardBy = (
  audience: Audience,
  plantId: string
): ReadonlyArray<string> =>
  pipe(
    Option.fromNullishOr(audience.get(plantId)),
    Option.getOrElse(() => [])
  )

export class RecipientRepository extends Context.Service<
  RecipientRepository,
  IRecipientRepository
>()('RecipientRepository') {}

export const RecipientRepositoryLive = Layer.effect(
  RecipientRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      audienceOf: Effect.fn('RecipientRepository.audienceOf')(function* (
        plantIds: ReadonlyArray<string>
      ) {
        if (Array.isReadonlyArrayEmpty(plantIds)) return new Map()
        const audience = plantAudience(db, inArray(plants.id, [...plantIds]))
        const rows = yield* db
          .select({
            plantId: audience.plantId,
            recipientId: audience.recipientId,
          })
          .from(audience)
          .orderBy(
            asc(audience.role),
            asc(audience.joinedAt),
            asc(audience.recipientId)
          )
        return audienceByPlant(plantIds, rows)
      }),
    }
  })
)
