import type { SqlError } from '@effect/sql/SqlError'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import {
  CareScheduleRepository,
  type CareType,
} from '@lily/api/repositories/care-schedule.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import type { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { scheduleCareReminder } from '@lily/api/services/plants/helpers/schedule-care-reminder'
import { startOfDay } from '@lily/shared'
import { FutureDateNotAllowedError } from '@lily/shared/errors/plant'
import type { PlantCorrectCareDatesRequest } from '@lily/shared/plant'
import { DateTime, Duration, Effect, Option, pipe } from 'effect'

const correctSingleCareDate = (
  plantId: string,
  correctedDate: Date,
  careType: CareType,
  plant: PlantWithRoom,
  timezone: string
) =>
  Effect.gen(function* () {
    const careLogRepo = yield* CareLogRepository
    const scheduleRepo = yield* CareScheduleRepository

    const correctedDt = DateTime.unsafeMake(correctedDate)
    const nowDt = DateTime.unsafeNow()

    // Validate that the corrected date is not in the future (1-minute tolerance)
    if (
      DateTime.greaterThan(
        correctedDt,
        DateTime.addDuration(nowDt, Duration.minutes(1))
      )
    ) {
      return yield* new FutureDateNotAllowedError()
    }

    const careDate = DateTime.toDateUtc(correctedDt)

    // Find the most recent care log of this type and update it if exists
    const latestLog = yield* careLogRepo.findLatestByPlantAndType(
      plantId,
      careType
    )

    if (latestLog) {
      yield* careLogRepo.update(latestLog.id, { date: careDate })
    }

    // Read original and current dates from the schedule
    const schedule = yield* scheduleRepo.findByPlantAndType(plantId, careType)

    const originalLastCare = schedule?.lastCareAt
    const currentNextCare = schedule?.nextCareAt

    // Shift nextCareAt by the same delta as the date correction.
    // This preserves any weather adjustment that was already applied.
    // e.g. original: lastWatered=Mon, next=Mon+8 (7 base + 1 weather)
    //      correct to Sun → delta=-1day → next=Mon+8-1=Sun+8
    const nextCareAt = pipe(
      Option.all({
        original: Option.fromNullable(originalLastCare),
        next: Option.fromNullable(currentNextCare),
      }),
      Option.map(({ original, next }) => {
        // Truncate to local-midnight (not UTC) so the delta reflects how many
        // *calendar days* the user shifted the last-care date by — otherwise a
        // correction within the local day but across the UTC boundary produces
        // a delta of 0 (or ±1) that disagrees with the visible date change.
        const originalDayStart = startOfDay(
          DateTime.unsafeMake(original),
          timezone
        )
        const correctedDayStart = startOfDay(correctedDt, timezone)
        // Signed delta in ms (positive = corrected is later, negative = earlier)
        const deltaMs = DateTime.distance(originalDayStart, correctedDayStart)
        const nextMs = DateTime.toEpochMillis(DateTime.unsafeMake(next))
        return DateTime.toDateUtc(DateTime.unsafeMake(Number(nextMs) + deltaMs))
      }),
      Option.getOrUndefined
    )

    // Update schedule table
    yield* scheduleRepo.updateByPlantAndType(plantId, careType, {
      lastCareAt: careDate,
      ...(nextCareAt !== undefined ? { nextCareAt } : {}),
    })

    // Schedule next reminder if we have a next care date
    if (nextCareAt) {
      yield* scheduleCareReminder({
        plantId,
        userId: plant.userId,
        type: `${careType}_reminder` as const,
        scheduledDate: nextCareAt,
        remindersEnabled: plant.remindersEnabled,
      })
    }
  })

export const correctCareDates = (
  plant: PlantWithRoom,
  request: PlantCorrectCareDatesRequest & { id: string }
): Effect.Effect<
  PlantWithRoom,
  SqlError | FutureDateNotAllowedError,
  | PlantRepository
  | CareLogRepository
  | CareScheduleRepository
  | NotificationRepository
  | UserRepository
  | DelegationRepository
  | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const userRepo = yield* UserRepository

    const user = yield* userRepo.findById(plant.userId)
    const timezone = pipe(
      Option.fromNullable(user),
      Option.flatMap((u) => Option.fromNullable(u.timezone)),
      Option.getOrElse(() => 'UTC')
    )

    // Correct watering date if provided
    if (request.lastWateredAt) {
      yield* correctSingleCareDate(
        request.id,
        request.lastWateredAt,
        'watering',
        plant,
        timezone
      )
    }

    // Correct fertilization date if provided
    if (request.lastFertilizedAt) {
      yield* correctSingleCareDate(
        request.id,
        request.lastFertilizedAt,
        'fertilization',
        plant,
        timezone
      )
    }

    // Re-fetch to get updated plant with room data
    const updatedPlant = yield* repo.findById(request.id)

    return pipe(
      Option.fromNullable(updatedPlant),
      Option.getOrElse(() => plant)
    )
  }).pipe(
    Effect.withSpan('PlantsService.correctCareDates', {
      attributes: { 'plant.id': request.id },
    })
  )
