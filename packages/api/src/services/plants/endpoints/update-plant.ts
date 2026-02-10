import type { SqlError } from '@effect/sql/SqlError'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import type { PlantUpdateRequest } from '@lily/shared/plant'
import { DateTime, Effect, Option, pipe, Record, Struct } from 'effect'

export const updatePlant = (
  request: PlantUpdateRequest & { id: string }
): Effect.Effect<
  PlantWithRoom,
  SqlError | PlantNotFoundError,
  PlantRepository
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    yield* Effect.annotateCurrentSpan('plant.id', request.id)

    // Get current plant to check if we need to set next care dates
    const currentPlant = yield* repo.findById(request.id)
    if (!currentPlant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    const now = DateTime.toDateUtc(DateTime.unsafeNow())

    // Build update data from request
    const data = pipe(
      Record.fromEntries(Struct.entries(request)),
      Record.remove('id'),
      Record.filter((value) => value !== undefined)
    ) as Record<string, unknown>

    // If wateringFrequencyDays is being set and nextWateringAt is null, set it to now
    if (
      request.wateringFrequencyDays !== undefined &&
      currentPlant.nextWateringAt === null
    ) {
      data.nextWateringAt = now
    }

    // Handle fertilization schedule changes
    if (request.fertilizationFrequencyDays !== undefined) {
      // If fertilization is being enabled (was null, now has a value)
      if (
        request.fertilizationFrequencyDays !== null &&
        currentPlant.nextFertilizationAt === null
      ) {
        data.nextFertilizationAt = now
      }
      // If fertilization is being disabled (set to null)
      if (request.fertilizationFrequencyDays === null) {
        data.nextFertilizationAt = null
      }
    }

    yield* repo.update(request.id, data)

    const updated = yield* repo.findById(request.id)
    return pipe(
      Option.fromNullable(updated),
      Option.getOrElse(() => currentPlant)
    )
  }).pipe(Effect.withSpan('PlantsService.updatePlant'))
