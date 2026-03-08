import type { SqlError } from '@effect/sql/SqlError'
import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
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
  PlantRepository | CareScheduleRepository
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const scheduleRepo = yield* CareScheduleRepository
    yield* Effect.annotateCurrentSpan('plant.id', request.id)

    // Get current plant to check if we need to set next care dates
    const currentPlant = yield* repo.findById(request.id)
    if (!currentPlant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    const now = DateTime.toDateUtc(DateTime.unsafeNow())

    // Build update data from request, excluding care-related fields
    const data = pipe(
      Record.fromEntries(Struct.entries(request)),
      Record.remove('id'),
      Record.remove('wateringFrequencyDays'),
      Record.remove('fertilizationFrequencyDays'),
      Record.filter((value) => value !== undefined)
    ) as Record<string, unknown>

    // Update non-care plant fields
    yield* repo.update(request.id, data)

    // Update schedule rows
    if (request.wateringFrequencyDays !== undefined) {
      const existingSchedule = yield* scheduleRepo.findByPlantAndType(
        request.id,
        'watering'
      )
      yield* scheduleRepo.upsert(request.id, 'watering', {
        frequencyDays: request.wateringFrequencyDays,
        ...(!existingSchedule || !existingSchedule.nextCareAt
          ? { nextCareAt: now }
          : {}),
      })
    }

    if (request.fertilizationFrequencyDays !== undefined) {
      if (request.fertilizationFrequencyDays !== null) {
        // Enable or update fertilization schedule
        const existingSchedule = yield* scheduleRepo.findByPlantAndType(
          request.id,
          'fertilization'
        )
        yield* scheduleRepo.upsert(request.id, 'fertilization', {
          frequencyDays: request.fertilizationFrequencyDays,
          ...(!existingSchedule || !existingSchedule.nextCareAt
            ? { nextCareAt: now }
            : {}),
        })
      } else {
        // Disable fertilization schedule
        yield* scheduleRepo.deleteByPlantAndType(request.id, 'fertilization')
      }
    }

    const updated = yield* repo.findById(request.id)
    return pipe(
      Option.fromNullable(updated),
      Option.getOrElse(() => currentPlant)
    )
  }).pipe(Effect.withSpan('PlantsService.updatePlant'))
