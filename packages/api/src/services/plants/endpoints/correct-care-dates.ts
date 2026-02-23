import type { SqlError } from '@effect/sql/SqlError'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import type { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { scheduleCareReminder } from '@lily/api/services/plants/helpers/schedule-care-reminder'
import {
  FutureDateNotAllowedError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import type { PlantCorrectCareDatesRequest } from '@lily/shared/plant'
import { DateTime, Duration, Effect, Match, Option, pipe } from 'effect'

type CareType = 'watering' | 'fertilization'

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

const correctSingleCareDate = (
  plantId: string,
  correctedDate: Date,
  careType: CareType,
  plant: PlantWithRoom
) =>
  Effect.gen(function* () {
    const config = getCareTypeConfig(careType)
    const careLogRepo = yield* CareLogRepository
    const repo = yield* PlantRepository

    const correctedDt = DateTime.unsafeMake(correctedDate)
    const nowDt = DateTime.unsafeNow()

    // Validate that the corrected date is not in the future (1-minute tolerance)
    if (
      DateTime.greaterThan(
        correctedDt,
        DateTime.addDuration(nowDt, Duration.minutes(1))
      )
    ) {
      return yield* Effect.fail(new FutureDateNotAllowedError())
    }

    const careDate = DateTime.toDateUtc(correctedDt)

    // Find the most recent care log of this type and update it if exists
    const latestLog = yield* careLogRepo.findLatestByPlantAndType(
      plantId,
      config.careLogType
    )

    if (latestLog) {
      yield* careLogRepo.update(latestLog.id, { date: careDate })
    }

    // Shift nextCareAt by the same delta as the date correction.
    // This preserves any weather adjustment that was already applied.
    // e.g. original: lastWatered=Mon, next=Mon+8 (7 base + 1 weather)
    //      correct to Sun → delta=-1day → next=Mon+8-1=Sun+8
    const originalLastCare = plant[config.lastCareField]
    const currentNextCare = plant[config.nextCareField]

    const nextCareAt = pipe(
      Option.all({
        original: Option.fromNullable(originalLastCare),
        next: Option.fromNullable(currentNextCare),
      }),
      Option.map(({ original, next }) => {
        const originalDayStart = DateTime.startOf(
          DateTime.unsafeMake(original),
          'day'
        )
        const correctedDayStart = DateTime.startOf(correctedDt, 'day')
        // Signed delta in ms (positive = corrected is later, negative = earlier)
        const deltaMs = DateTime.distance(originalDayStart, correctedDayStart)
        const nextMs = DateTime.toEpochMillis(DateTime.unsafeMake(next))
        return new Date(Number(nextMs) + deltaMs)
      }),
      Option.getOrUndefined
    )

    const updatePayload = {
      [config.lastCareField]: careDate,
      ...(nextCareAt !== undefined && {
        [config.nextCareField]: nextCareAt,
      }),
    }

    yield* repo.update(plantId, updatePayload)

    // Schedule next reminder if we have a next care date
    if (nextCareAt) {
      yield* scheduleCareReminder({
        plantId,
        plantName: plant.name,
        userId: plant.userId,
        type: config.reminderType,
        scheduledDate: nextCareAt,
        remindersEnabled: plant.remindersEnabled,
      })
    }
  })

export const correctCareDates = (
  request: PlantCorrectCareDatesRequest & { id: string }
): Effect.Effect<
  PlantWithRoom,
  SqlError | PlantNotFoundError | FutureDateNotAllowedError,
  | PlantRepository
  | CareLogRepository
  | NotificationRepository
  | UserRepository
  | DelegationRepository
  | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository

    // Fetch the plant
    const plant = yield* repo.findById(request.id)

    if (!plant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    // Correct watering date if provided
    if (request.lastWateredAt) {
      yield* correctSingleCareDate(
        request.id,
        request.lastWateredAt,
        'watering',
        plant
      )
    }

    // Correct fertilization date if provided
    if (request.lastFertilizedAt) {
      yield* correctSingleCareDate(
        request.id,
        request.lastFertilizedAt,
        'fertilization',
        plant
      )
    }

    // Re-fetch to get updated plant with room data
    const updatedPlant = yield* repo.findById(request.id)

    if (!updatedPlant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    return updatedPlant
  }).pipe(
    Effect.withSpan('PlantsService.correctCareDates', {
      attributes: { 'plant.id': request.id },
    })
  )
