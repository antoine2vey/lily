import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { plants, wateringHistory } from '@lily/db'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import type { Plant, PlantWaterRequest } from '@lily/shared/plant'
import { eq } from 'drizzle-orm'
import { Duration, Effect } from 'effect'

export const waterPlant = (
  request: PlantWaterRequest & { id: string }
): Effect.Effect<Plant, SqlError | PlantNotFoundError, PgDrizzle.PgDrizzle> =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    // First get the plant to calculate next watering date
    const [plant] = yield* db
      .select()
      .from(plants)
      .where(eq(plants.id, request.id))

    if (!plant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    const now = new Date()
    const nextWateringAt = new Date(
      now.getTime() +
        Duration.toMillis(Duration.days(plant.wateringFrequencyDays))
    )

    // Update the plant with watering info
    const [updatedPlant] = yield* db
      .update(plants)
      .set({
        lastWateredAt: now,
        nextWateringAt,
      })
      .where(eq(plants.id, request.id))
      .returning()

    if (!updatedPlant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    // Create watering history record
    yield* db.insert(wateringHistory).values({
      plantId: request.id,
      notes: request.notes || null,
    })

    return updatedPlant
  })
