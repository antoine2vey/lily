import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { plants } from '@lily/db'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import type { Plant } from '@lily/shared/plant'
import { eq } from 'drizzle-orm'
import { Effect } from 'effect'

export const fertilizePlant = (request: {
  id: string
}): Effect.Effect<Plant, SqlError | PlantNotFoundError, PgDrizzle.PgDrizzle> =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    const [plant] = yield* db
      .update(plants)
      .set({
        lastFertilizedAt: new Date(),
      })
      .where(eq(plants.id, request.id))
      .returning()

    if (!plant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    return plant
  })
