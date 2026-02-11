import type { SqlError } from '@effect/sql/SqlError'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import { scheduleCareReminder } from '@lily/api/services/plants/helpers/schedule-care-reminder'
import { calculatePlantAdjustment } from '@lily/api/services/weather/algorithm'
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
  PlantRepository | NotificationRepository | UserRepository
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
          Effect.catchAll((error) =>
            Effect.logWarning(`Care readjustment failed for user ${user.id}`, {
              error,
            })
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
  PlantRepository | NotificationRepository | UserRepository
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
      `[Readjust] Processing user ${user.id} at ${locationKey} (tz=${user.timezone ?? 'UTC'})`
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

    // Process each plant sequentially to avoid overwhelming the DB
    yield* Effect.forEach(plantsResult.items, (plant) =>
      readjustPlantSchedule(plant, user, weatherCtx).pipe(
        Effect.catchAll((error) =>
          Effect.logWarning(`Readjustment failed for plant ${plant.id}`, {
            error,
          })
        )
      )
    )
  })

const readjustPlantSchedule = (
  plant: {
    id: string
    name: string
    category: string | null
    wateringFrequencyDays: number
    wateringRating: number
    lastWateredAt: Date | null
    nextWateringAt: Date | null
    lastFertilizedAt: Date | null
    nextFertilizationAt: Date | null
    fertilizationFrequencyDays: number | null
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
  PlantRepository | NotificationRepository | UserRepository
> =>
  Effect.gen(function* () {
    // Skip plants without a last watering date or next watering date
    if (!plant.lastWateredAt || !plant.nextWateringAt) {
      yield* Effect.log(
        `[Readjust] Skipping plant "${plant.name}" (${plant.id}) — no lastWateredAt or nextWateringAt`
      )
      return
    }

    yield* Effect.log(
      `[Readjust] Evaluating plant "${plant.name}" (${plant.id}): freq=${plant.wateringFrequencyDays}d, lastWatered=${plant.lastWateredAt.toISOString()}, nextWatering=${plant.nextWateringAt.toISOString()}`
    )

    const plantRepo = yield* PlantRepository

    // Run the weather adjustment algorithm
    const adjustment = calculatePlantAdjustment(
      {
        id: plant.id,
        category: plant.category,
        wateringFrequencyDays: plant.wateringFrequencyDays,
        wateringRating: plant.wateringRating,
        isOutdoor: plant.room?.isOutdoor ?? false,
      },
      weatherCtx.currentWeather,
      weatherCtx.recentHistory,
      weatherCtx.forecast
    )

    yield* Effect.log(
      `[Readjust] Adjustment result for "${plant.name}": adjustedDays=${adjustment.adjustedWateringDays}, multiplier=${adjustment.wateringMultiplier}, skipWatering=${adjustment.skipWatering}, skipFertilization=${adjustment.skipFertilization}`
    )

    const nowDt = DateTime.unsafeNow()
    const nowMs = DateTime.toEpochMillis(nowDt)

    let wateringChanged = false
    let fertilizationChanged = false
    let newNextWateringAt: Date | undefined
    let newNextFertilizationAt: Date | undefined

    // --- Watering readjustment ---
    const lastWateredDt = DateTime.unsafeMake(plant.lastWateredAt)

    if (adjustment.skipWatering) {
      // If skip watering, push to tomorrow if the current next date is today or past
      const currentNextDt = DateTime.unsafeMake(plant.nextWateringAt)
      const currentNextMs = DateTime.toEpochMillis(currentNextDt)
      if (currentNextMs <= nowMs) {
        const tomorrowDt = DateTime.addDuration(nowDt, Duration.days(1))
        newNextWateringAt = DateTime.toDateUtc(tomorrowDt)
      } else {
        // Already in the future, keep it
        newNextWateringAt = plant.nextWateringAt
      }
    } else {
      // Recalculate from lastWateredAt + adjustedWateringDays
      const adjustedDt = DateTime.addDuration(
        lastWateredDt,
        Duration.days(adjustment.adjustedWateringDays)
      )
      newNextWateringAt = DateTime.toDateUtc(adjustedDt)
    }

    // Only update if the date actually changed (1-minute tolerance)
    const currentNextWateringDt = DateTime.unsafeMake(plant.nextWateringAt)
    const distanceMs = DateTime.distance(
      currentNextWateringDt,
      DateTime.unsafeMake(newNextWateringAt)
    )
    if (Number(Duration.toMillis(distanceMs)) > 60_000) {
      wateringChanged = true
    }

    // --- Fertilization readjustment ---
    if (
      plant.fertilizationFrequencyDays &&
      plant.lastFertilizedAt &&
      plant.nextFertilizationAt &&
      adjustment.skipFertilization
    ) {
      const currentFertDt = DateTime.unsafeMake(plant.nextFertilizationAt)
      const currentFertMs = DateTime.toEpochMillis(currentFertDt)
      if (currentFertMs <= nowMs) {
        // Push fertilization by 1 day from now
        const tomorrowDt = DateTime.addDuration(nowDt, Duration.days(1))
        newNextFertilizationAt = DateTime.toDateUtc(tomorrowDt)

        const fertDistanceMs = DateTime.distance(
          currentFertDt,
          DateTime.unsafeMake(newNextFertilizationAt)
        )
        if (Number(Duration.toMillis(fertDistanceMs)) > 60_000) {
          fertilizationChanged = true
        }
      }
    }

    // Apply updates if anything changed
    if (wateringChanged || fertilizationChanged) {
      const updateData = {
        ...(wateringChanged && newNextWateringAt
          ? { nextWateringAt: newNextWateringAt }
          : {}),
        ...(fertilizationChanged && newNextFertilizationAt
          ? { nextFertilizationAt: newNextFertilizationAt }
          : {}),
      }

      yield* plantRepo.update(plant.id, updateData)

      yield* Effect.log(
        `[Readjust] UPDATED plant "${plant.name}" (${plant.id}): watering=${wateringChanged}${wateringChanged && newNextWateringAt ? ` (${plant.nextWateringAt?.toISOString()} → ${newNextWateringAt.toISOString()})` : ''}, fertilization=${fertilizationChanged}${fertilizationChanged && newNextFertilizationAt ? ` (${plant.nextFertilizationAt?.toISOString()} → ${newNextFertilizationAt.toISOString()})` : ''}`
      )

      // Reschedule notifications
      if (wateringChanged && newNextWateringAt) {
        yield* scheduleCareReminder({
          plantId: plant.id,
          plantName: plant.name,
          userId: plant.userId,
          type: 'watering_reminder',
          scheduledDate: newNextWateringAt,
          remindersEnabled: plant.remindersEnabled && user.careReminders,
        })
      }

      if (fertilizationChanged && newNextFertilizationAt) {
        yield* scheduleCareReminder({
          plantId: plant.id,
          plantName: plant.name,
          userId: plant.userId,
          type: 'fertilization_reminder',
          scheduledDate: newNextFertilizationAt,
          remindersEnabled: plant.remindersEnabled && user.careReminders,
        })
      }
    }
  })
