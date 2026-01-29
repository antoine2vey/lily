import type { SqlError } from '@effect/sql/SqlError'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import { scheduleCareReminder } from '@lily/api/services/plants/helpers/schedule-care-reminder'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import type { Plant } from '@lily/shared/plant'
import { DateTime, Duration, Effect, Match, Option, pipe } from 'effect'

export type CareType = 'watering' | 'fertilization'

export interface ExecutePlantCareParams {
  readonly plantId: string
  readonly careType: CareType
  readonly notes?: string | undefined
}

// Configuration for each care type
interface CareTypeConfig {
  readonly frequencyField:
    | 'wateringFrequencyDays'
    | 'fertilizationFrequencyDays'
  readonly lastCareField: 'lastWateredAt' | 'lastFertilizedAt'
  readonly nextCareField: 'nextWateringAt' | 'nextFertilizationAt'
  readonly reminderType: 'watering_reminder' | 'fertilization_reminder'
  readonly careLogType: 'watering' | 'fertilization'
}

const getCareTypeConfig = (careType: CareType): CareTypeConfig =>
  pipe(
    Match.value(careType),
    Match.when('watering', () => ({
      frequencyField: 'wateringFrequencyDays' as const,
      lastCareField: 'lastWateredAt' as const,
      nextCareField: 'nextWateringAt' as const,
      reminderType: 'watering_reminder' as const,
      careLogType: 'watering' as const,
    })),
    Match.when('fertilization', () => ({
      frequencyField: 'fertilizationFrequencyDays' as const,
      lastCareField: 'lastFertilizedAt' as const,
      nextCareField: 'nextFertilizationAt' as const,
      reminderType: 'fertilization_reminder' as const,
      careLogType: 'fertilization' as const,
    })),
    Match.exhaustive
  )

export const executePlantCare = (
  params: ExecutePlantCareParams
): Effect.Effect<
  Plant,
  SqlError | PlantNotFoundError,
  PlantRepository | CareLogRepository | NotificationRepository | UserRepository
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const careLogRepo = yield* CareLogRepository
    const config = getCareTypeConfig(params.careType)

    // Fetch the plant
    const plant = yield* repo.findById(params.plantId)

    if (!plant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    const nowDt = DateTime.unsafeNow()
    const now = DateTime.toDateUtc(nowDt)

    // Get frequency - watering always has frequency, fertilization is optional
    const frequency = plant[config.frequencyField]

    // Calculate next care date (if frequency exists)
    const nextCareAt = pipe(
      Option.fromNullable(frequency),
      Option.map((days) =>
        DateTime.toDateUtc(DateTime.addDuration(nowDt, Duration.days(days)))
      ),
      Option.getOrUndefined
    )

    // Build update payload dynamically
    const updatePayload = {
      [config.lastCareField]: now,
      ...(nextCareAt && { [config.nextCareField]: nextCareAt }),
    }

    // Update the plant
    const updatedPlant = yield* repo.update(params.plantId, updatePayload)

    if (!updatedPlant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    // Create care log record
    yield* careLogRepo.create({
      type: config.careLogType,
      plantId: params.plantId,
      notes: params.notes,
      date: now,
    })

    // Schedule next reminder if we have a next care date
    if (nextCareAt) {
      yield* scheduleCareReminder({
        plantId: params.plantId,
        plantName: plant.name,
        userId: plant.userId,
        type: config.reminderType,
        scheduledDate: nextCareAt,
        remindersEnabled: plant.remindersEnabled,
      })
    }

    return updatedPlant
  })
