import type { SqlError } from '@effect/sql/SqlError'
import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import type { CareType } from '@lily/shared'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import type { PlantUpdateRequest } from '@lily/shared/plant'
import { Array, DateTime, Effect, Option, pipe, Record, Struct } from 'effect'

/**
 * Upsert or delete a single optional care schedule.
 * - `undefined` → no change (skip)
 * - `null` → disable (delete schedule row)
 * - `number` → enable/update (upsert with frequency, seed nextCareAt if missing)
 */
const syncOptionalSchedule = (
  scheduleRepo: Effect.Effect.Success<typeof CareScheduleRepository>,
  existingSchedules: readonly { careType: string; nextCareAt: Date | null }[],
  plantId: string,
  careType: CareType,
  frequencyDays: number | null | undefined,
  now: Date
) =>
  Effect.gen(function* () {
    if (frequencyDays === undefined) return
    if (frequencyDays !== null) {
      const existing = pipe(
        Array.findFirst(existingSchedules, (s) => s.careType === careType),
        Option.getOrNull
      )
      yield* scheduleRepo.upsert(plantId, careType, {
        frequencyDays,
        ...(!existing || !existing.nextCareAt ? { nextCareAt: now } : {}),
      })
    } else {
      yield* scheduleRepo.deleteByPlantAndType(plantId, careType)
    }
  })

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
      Record.remove('mistingFrequencyDays'),
      Record.remove('repottingFrequencyDays'),
      Record.filter((value) => value !== undefined)
    ) as Record<string, unknown>

    // Update non-care plant fields
    yield* repo.update(request.id, data)

    // Fetch all existing schedules in a single query
    const existingSchedules = yield* scheduleRepo.findByPlant(request.id)

    // Watering is always-present (non-nullable), handle separately
    if (request.wateringFrequencyDays !== undefined) {
      const existing = pipe(
        Array.findFirst(existingSchedules, (s) => s.careType === 'watering'),
        Option.getOrNull
      )
      yield* scheduleRepo.upsert(request.id, 'watering', {
        frequencyDays: request.wateringFrequencyDays,
        ...(!existing || !existing.nextCareAt ? { nextCareAt: now } : {}),
      })
    }

    // Optional care types: null → delete, number → upsert
    yield* syncOptionalSchedule(
      scheduleRepo,
      existingSchedules,
      request.id,
      'fertilization',
      request.fertilizationFrequencyDays,
      now
    )
    yield* syncOptionalSchedule(
      scheduleRepo,
      existingSchedules,
      request.id,
      'misting',
      request.mistingFrequencyDays,
      now
    )
    yield* syncOptionalSchedule(
      scheduleRepo,
      existingSchedules,
      request.id,
      'repotting',
      request.repottingFrequencyDays,
      now
    )

    const updated = yield* repo.findById(request.id)
    return pipe(
      Option.fromNullable(updated),
      Option.getOrElse(() => currentPlant)
    )
  }).pipe(Effect.withSpan('PlantsService.updatePlant'))
