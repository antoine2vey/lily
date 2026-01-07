import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { plantPhotos } from '@lily/db'
import { and, eq } from 'drizzle-orm'
import { Effect } from 'effect'

export const deletePlantPhoto = ({
  plantId,
  photoId,
}: {
  plantId: string
  photoId: string
}): Effect.Effect<void, SqlError, PgDrizzle.PgDrizzle> => {
  return Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    yield* db
      .delete(plantPhotos)
      .where(and(eq(plantPhotos.id, photoId), eq(plantPhotos.plantId, plantId)))

    return yield* Effect.void
  })
}
