import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { plantPhotos } from '@lily/db'
import type { PlantPhoto } from '@lily/shared/plant'
import { eq } from 'drizzle-orm'
import { Effect } from 'effect'

export const getPlantPhotos = ({
  plantId,
}: {
  plantId: string
}): Effect.Effect<PlantPhoto[], SqlError, PgDrizzle.PgDrizzle> =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return yield* db
      .select()
      .from(plantPhotos)
      .where(eq(plantPhotos.plantId, plantId))
  })
