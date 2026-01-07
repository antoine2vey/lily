import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { plants } from '@lily/db'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import type { Plant, PlantUpdateRequest } from '@lily/shared/plant'
import { eq } from 'drizzle-orm'
import { Effect, pipe, Record } from 'effect'
import { transformPlant } from '../utils'

export const updatePlant = (
  request: PlantUpdateRequest & { id: string }
): Effect.Effect<Plant, SqlError | PlantNotFoundError, PgDrizzle.PgDrizzle> =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    const data = pipe(
      Object.entries(request),
      Record.fromEntries,
      Record.remove('id'),
      Record.filter((_, value) => value !== undefined)
    )

    const [rawPlant] = yield* db
      .update(plants)
      .set(data)
      .where(eq(plants.id, request.id))
      .returning()

    if (!rawPlant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    return transformPlant(rawPlant)
  })
