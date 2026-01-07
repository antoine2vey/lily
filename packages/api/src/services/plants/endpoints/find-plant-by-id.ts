import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { plants } from '@lily/db'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import type { Plant } from '@lily/shared/plant'
import { eq } from 'drizzle-orm'
import { Effect } from 'effect'
import type { PlantByIdRequest } from '../utils'

export const findPlantById = ({
  id,
}: PlantByIdRequest): Effect.Effect<
  Plant,
  SqlError | PlantNotFoundError,
  PgDrizzle.PgDrizzle
> =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    const [plant] = yield* db.select().from(plants).where(eq(plants.id, id))

    if (!plant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    return plant
  })
