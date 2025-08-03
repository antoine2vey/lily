import { type PrismaError, PrismaService } from '@lily/db'
import type { Plant, PlantWaterRequest } from '@lily/shared/plant'
import { plantSelector } from '@lily/shared/selectors/plant'
import { Duration, Effect } from 'effect'

export const waterPlant = (
  request: PlantWaterRequest & { id: string }
): Effect.Effect<Plant, PrismaError, PrismaService> =>
  Effect.gen(function* () {
    const prisma = yield* PrismaService

    // First get the plant to calculate next watering date
    const plant = yield* prisma.plant.findUniqueOrThrow({
      where: { id: request.id },
      select: plantSelector,
    })

    const now = new Date()
    const nextWateringAt = new Date(
      now.getTime() +
        Duration.toMillis(Duration.days(plant.wateringFrequencyDays))
    )

    // Update the plant with watering info
    const updatedPlant = yield* prisma.plant.update({
      where: { id: request.id },
      data: {
        lastWateredAt: now,
        nextWateringAt,
      },
      select: plantSelector,
    })

    // Create watering history record
    yield* prisma.wateringHistory.create({
      data: {
        plantId: request.id,
        notes: request.notes || null,
      },
    })

    return updatedPlant
  })
