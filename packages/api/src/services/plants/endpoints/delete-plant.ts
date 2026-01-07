import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { plants } from '@lily/db'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import type { Plant } from '@lily/shared/plant'
import { eq } from 'drizzle-orm'
import { Effect } from 'effect'
import { type PlantDeleteRequest, transformPlant } from '../utils'

export const deletePlant = ({
  id,
}: PlantDeleteRequest): Effect.Effect<
  Plant,
  SqlError | PlantNotFoundError,
  PgDrizzle.PgDrizzle
> =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    const [rawPlant] = yield* db
      .delete(plants)
      .where(eq(plants.id, id))
      .returning()

    if (!rawPlant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    return transformPlant(rawPlant)
  })
