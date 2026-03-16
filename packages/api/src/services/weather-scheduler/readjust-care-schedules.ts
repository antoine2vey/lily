import type { SqlError } from '@effect/sql/SqlError'
import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import { scheduleCareReminder } from '@lily/api/services/plants/helpers/schedule-care-reminder'
import { calculateScheduleDelta } from '@lily/api/services/weather/algorithm'
import type { WeatherContext } from '@lily/api/services/weather/helpers/get-weather-context'
import { roundCoord } from '@lily/shared'
import { Array, DateTime, Duration, Effect, Option, pipe } from 'effect'

interface WeatherEnabledUser {
  readonly id: string
  readonly latitude: number | null
  readonly longitude: number | null
  readonly timezone: string | null
  readonly careReminders: boolean
}

/**
 * Readjust care schedules for the given weather-enabled users based on
 * pre-built weather contexts (one per distinct location).
 *
 * Uses the forecast-averaged delta model: instead of recalculating
 * nextWateringAt from scratch, we compute a stable delta (in days) and
 * apply it. Re-running with the same weather produces delta = 0.
 *
 * The caller (scheduler) is responsible for:
 * 1. Fetching the user list (avoids a duplicate DB query)
 * 2. Building the weather context map keyed by "lat_lng" (avoids
 *    redundant DB/cache hits when multiple users share a location)
 */
export const readjustCareSchedules = (
  weatherUsers: ReadonlyArray<WeatherEnabledUser>,
  weatherContextMap: ReadonlyMap<string, WeatherContext>
): Effect.Effect<
  void,
  never,
  | PlantRepository
  | CareScheduleRepository
  | NotificationRepository
  | UserRepository
  | DelegationRepository
> =>
  Effect.gen(function* () {
    if (Array.isEmptyReadonlyArray(weatherUsers)) {
      return
    }

    yield* Effect.log(
      `[Readjust] Processing ${weatherUsers.length} weather-enabled users with ${weatherContextMap.size} location contexts`
    )

    yield* Effect.forEach(
      weatherUsers,
      (user) =>
        readjustUserPlants(user, weatherContextMap).pipe(
          Effect.catchTag('SqlError', (error) =>
            Effect.logWarning(
              `[weather-scheduler] Care readjustment failed for user ${user.id}`,
              { error: String(error) }
            )
          )
        ),
      { concurrency: 5 }
    )

    yield* Effect.log('[Readjust] Care schedule readjustment complete')
  })

const readjustUserPlants = (
  user: WeatherEnabledUser,
  weatherContextMap: ReadonlyMap<string, WeatherContext>
): Effect.Effect<
  void,
  SqlError,
  | PlantRepository
  | CareScheduleRepository
  | NotificationRepository
  | UserRepository
  | DelegationRepository
> =>
  Effect.gen(function* () {
    const latOption = Option.fromNullable(user.latitude)
    const lngOption = Option.fromNullable(user.longitude)

    if (Option.isNone(latOption) || Option.isNone(lngOption)) {
      yield* Effect.log(`[Readjust] Skipping user ${user.id} — missing lat/lng`)
      return
    }

    const locationKey = `${roundCoord(latOption.value)}_${roundCoord(lngOption.value)}`
    const weatherCtx = weatherContextMap.get(locationKey)

    if (!weatherCtx) {
      yield* Effect.log(
        `[Readjust] Skipping user ${user.id} — no weather context for ${locationKey}`
      )
      return
    }

    yield* Effect.log(
      `[Readjust] Processing user ${user.id} at ${locationKey} (tz=${pipe(
        Option.fromNullable(user.timezone),
        Option.getOrElse(() => 'UTC')
      )})`
    )

    const timezone = pipe(
      Option.fromNullable(user.timezone),
      Option.getOrElse(() => 'UTC')
    )

    const plantRepo = yield* PlantRepository

    // Get all user plants
    const plantsResult = yield* plantRepo.findAll({
      userId: user.id,
      timezone,
      page: 1,
      limit: 1000,
    })

    yield* Effect.log(
      `[Readjust] User ${user.id} has ${plantsResult.items.length} plants`
    )

    yield* Effect.forEach(
      plantsResult.items,
      (plant) =>
        readjustPlantSchedule(plant, user, weatherCtx).pipe(
          Effect.catchTag('SqlError', (error) =>
            Effect.logWarning(
              `[weather-scheduler] Readjustment failed for plant ${plant.id}`,
              { error: String(error) }
            )
          )
        ),
      { concurrency: 10 }
    )
  })

const readjustPlantSchedule = (
  plant: {
    id: string
    name: string
    category: string | null
    wateringRating: number
    remindersEnabled: boolean
    userId: string
    room: {
      id: string
      name: string
      icon: string
      luminosity: number | null
      isOutdoor: boolean
    } | null
  },
  user: {
    id: string
    careReminders: boolean
  },
  weatherCtx: WeatherContext
): Effect.Effect<
  void,
  SqlError,
  | PlantRepository
  | CareScheduleRepository
  | NotificationRepository
  | UserRepository
  | DelegationRepository
> =>
  Effect.gen(function* () {
    const scheduleRepo = yield* CareScheduleRepository

    // Fetch care schedules for this plant
    const schedules = yield* scheduleRepo.findByPlant(plant.id)

    const wateringSchedule = pipe(
      Array.findFirst(schedules, (s) => s.careType === 'watering'),
      Option.getOrNull
    )

    const fertSchedule = pipe(
      Array.findFirst(schedules, (s) => s.careType === 'fertilization'),
      Option.getOrNull
    )

    // Skip plants without a watering schedule or missing lastCareAt/nextCareAt
    if (
      !wateringSchedule ||
      !wateringSchedule.lastCareAt ||
      !wateringSchedule.nextCareAt
    ) {
      yield* Effect.log(
        `[Readjust] Skipping plant "${plant.name}" (${plant.id}) — no watering schedule or missing lastCareAt/nextCareAt`
      )
      return
    }

    yield* Effect.log(
      `[Readjust] Evaluating plant "${plant.name}" (${plant.id}): freq=${wateringSchedule.frequencyDays}d, lastWatered=${wateringSchedule.lastCareAt.toISOString()}, nextWatering=${wateringSchedule.nextCareAt.toISOString()}`
    )

    const nowDt = DateTime.unsafeNow()
    const nowMs = Number(DateTime.toEpochMillis(nowDt))

    // Compute the schedule delta using forecast-averaged gate model
    const delta = calculateScheduleDelta(
      {
        id: plant.id,
        category: plant.category,
        wateringFrequencyDays: wateringSchedule.frequencyDays,
        wateringRating: plant.wateringRating,
        isOutdoor: pipe(
          Option.fromNullable(plant.room),
          Option.map((r) => r.isOutdoor),
          Option.getOrElse(() => false)
        ),
        lastWateredAt: wateringSchedule.lastCareAt,
        nextWateringAt: wateringSchedule.nextCareAt,
        nextFertilizationAt: pipe(
          Option.fromNullable(fertSchedule),
          Option.flatMap((s) => Option.fromNullable(s.nextCareAt)),
          Option.getOrNull
        ),
        fertilizationFrequencyDays: pipe(
          Option.fromNullable(fertSchedule),
          Option.map((s) => s.frequencyDays),
          Option.getOrNull
        ),
      },
      weatherCtx,
      nowMs
    )

    yield* Effect.log(
      `[Readjust] Delta for "${plant.name}": watering=${delta.wateringDaysDelta}d${delta.wateringReason ? ` (${delta.wateringReason})` : ''}, fertilization=${delta.fertilizationDaysDelta}d`
    )

    const oneDayMs = Duration.toMillis(Duration.days(1))

    // Compute schedule changes as immutable result
    const newNextWateringAt = pipe(
      Option.fromNullable(wateringSchedule.nextCareAt),
      Option.filter(() => delta.wateringDaysDelta !== 0),
      Option.map(
        (wateringDate) =>
          new Date(wateringDate.getTime() + delta.wateringDaysDelta * oneDayMs)
      )
    )

    const newNextFertilizationAt = pipe(
      Option.fromNullable(fertSchedule),
      Option.flatMap((s) => Option.fromNullable(s.nextCareAt)),
      Option.filter(() => delta.fertilizationDaysDelta !== 0),
      Option.map(
        (fertDate) =>
          new Date(fertDate.getTime() + delta.fertilizationDaysDelta * oneDayMs)
      )
    )

    const wateringChanged = Option.isSome(newNextWateringAt)
    const fertilizationChanged = Option.isSome(newNextFertilizationAt)

    // Apply updates if anything changed
    if (wateringChanged || fertilizationChanged) {
      if (wateringChanged) {
        yield* scheduleRepo.updateByPlantAndType(plant.id, 'watering', {
          nextCareAt: newNextWateringAt.value,
        })
      }

      if (fertilizationChanged) {
        yield* scheduleRepo.updateByPlantAndType(plant.id, 'fertilization', {
          nextCareAt: newNextFertilizationAt.value,
        })
      }

      yield* Effect.log(
        `[Readjust] UPDATED plant "${plant.name}" (${plant.id}): watering=${String(wateringChanged)}${wateringChanged ? ` (${wateringSchedule.nextCareAt.toISOString()} → ${newNextWateringAt.value.toISOString()})` : ''}, fertilization=${String(fertilizationChanged)}${
          fertilizationChanged
            ? ` (${pipe(
                Option.fromNullable(fertSchedule),
                Option.flatMap((s) => Option.fromNullable(s.nextCareAt)),
                Option.map((d) => d.toISOString()),
                Option.getOrElse(() => 'none')
              )} → ${newNextFertilizationAt.value.toISOString()})`
            : ''
        }`
      )

      // Reschedule notifications
      if (wateringChanged) {
        yield* scheduleCareReminder({
          plantId: plant.id,

          userId: plant.userId,
          type: 'watering_reminder',
          scheduledDate: newNextWateringAt.value,
          remindersEnabled: plant.remindersEnabled && user.careReminders,
        })
      }

      if (fertilizationChanged) {
        yield* scheduleCareReminder({
          plantId: plant.id,

          userId: plant.userId,
          type: 'fertilization_reminder',
          scheduledDate: newNextFertilizationAt.value,
          remindersEnabled: plant.remindersEnabled && user.careReminders,
        })
      }
    }
  })
