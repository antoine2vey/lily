import type { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import { scheduleCareReminder } from '@lily/api/services/plants/helpers/schedule-care-reminder'
import {
  calculateScheduleDelta,
  toIndoorPlantContext,
} from '@lily/api/services/weather/algorithm'
import type { WeatherContext } from '@lily/api/services/weather/helpers/get-weather-context'
import {
  type CanopyId,
  type Orientation,
  type PlantOwner,
  roundCoord,
} from '@lily/shared'
import {
  Array,
  DateTime,
  Duration,
  Effect,
  Match,
  Option,
  pipe,
  String as Str,
} from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export interface WeatherScope {
  readonly owner: PlantOwner
  readonly latitude: number
  readonly longitude: number
  readonly timezone: string
}

interface LocatedRow {
  readonly id: string
  readonly latitude: number | null
  readonly longitude: number | null
  readonly timezone: string | null
}

const toWeatherScope = (
  row: LocatedRow,
  owner: PlantOwner
): Option.Option<WeatherScope> =>
  Option.map(
    Option.all({
      latitude: Option.fromNullishOr(row.latitude),
      longitude: Option.fromNullishOr(row.longitude),
    }),
    ({ latitude, longitude }) => ({
      owner,
      latitude,
      longitude,
      timezone: pipe(
        Option.fromNullishOr(row.timezone),
        Option.filter(Str.isNonEmpty),
        Option.getOrElse(() => 'UTC')
      ),
    })
  )

export const weatherScopes = (
  users: ReadonlyArray<LocatedRow>,
  canopies: ReadonlyArray<LocatedRow>
): ReadonlyArray<WeatherScope> =>
  Array.getSomes([
    ...Array.map(users, (user) =>
      toWeatherScope(user, { _tag: 'User', userId: user.id })
    ),
    ...Array.map(canopies, (canopy) =>
      toWeatherScope(canopy, {
        _tag: 'Canopy',
        canopyId: canopy.id as CanopyId,
      })
    ),
  ])

export const weatherLocationKey = (latitude: number, longitude: number) =>
  `${roundCoord(latitude)}_${roundCoord(longitude)}`

type ReadjustContext =
  | PlantRepository
  | CareScheduleRepository
  | NotificationRepository
  | UserRepository
  | DelegationRepository
  | CanopyRepository

/**
 * Readjust care schedules for the given weather scopes (users and Canopies)
 * based on pre-built weather contexts (one per distinct location).
 *
 * Uses the forecast-averaged delta model: instead of recalculating
 * nextWateringAt from scratch, we compute a stable delta (in days) and
 * apply it. Re-running with the same weather produces delta = 0.
 *
 * The caller (scheduler) is responsible for:
 * 1. Fetching the scopes (avoids a duplicate DB query)
 * 2. Building the weather context map keyed by "lat_lng" (avoids
 *    redundant DB/cache hits when several scopes share a location)
 */
export const readjustCareSchedules = (
  scopes: ReadonlyArray<WeatherScope>,
  weatherContextMap: ReadonlyMap<string, WeatherContext>
): Effect.Effect<void, never, ReadjustContext> =>
  Effect.gen(function* () {
    if (Array.isReadonlyArrayEmpty(scopes)) {
      return
    }

    yield* Effect.log(
      `[Readjust] Processing ${scopes.length} weather scopes with ${weatherContextMap.size} location contexts`
    )

    yield* Effect.forEach(
      scopes,
      (scope) => readjustScopePlants(scope, weatherContextMap),
      { concurrency: 5 }
    )

    yield* Effect.log('[Readjust] Care schedule readjustment complete')
  })

const readjustScopePlants = (
  scope: WeatherScope,
  weatherContextMap: ReadonlyMap<string, WeatherContext>
): Effect.Effect<void, never, ReadjustContext> => {
  const { label, listPlants } = pipe(
    Match.value(scope.owner),
    Match.tag('User', ({ userId }) => ({
      label: `user ${userId}`,
      listPlants: Effect.flatMap(PlantRepository, (plantRepo) =>
        plantRepo.findAll({
          userId,
          timezone: scope.timezone,
          page: 1,
          limit: 1000,
        })
      ).pipe(Effect.map((result) => result.items)),
    })),
    Match.tag('Canopy', ({ canopyId }) => ({
      label: `canopy ${canopyId}`,
      listPlants: Effect.flatMap(PlantRepository, (plantRepo) =>
        plantRepo.findLivingByCanopy(canopyId)
      ),
    })),
    Match.exhaustive
  )

  return Effect.gen(function* () {
    const locationKey = weatherLocationKey(scope.latitude, scope.longitude)
    const weatherCtx = weatherContextMap.get(locationKey)

    if (!weatherCtx) {
      yield* Effect.log(
        `[Readjust] Skipping ${label} — no weather context for ${locationKey}`
      )
      return
    }

    yield* Effect.log(
      `[Readjust] Processing ${label} at ${locationKey} (tz=${scope.timezone})`
    )

    const plants = yield* listPlants

    yield* Effect.log(`[Readjust] ${label} has ${plants.length} plants`)

    yield* Effect.forEach(
      plants,
      (plant) =>
        readjustPlantSchedule(plant, scope.latitude, weatherCtx).pipe(
          Effect.catchTag('SqlError', (error) =>
            Effect.logWarning(
              `[weather-scheduler] Readjustment failed for plant ${plant.id}`,
              { error: String(error) }
            )
          )
        ),
      { concurrency: 10 }
    )
  }).pipe(
    Effect.catchTag('SqlError', (error) =>
      Effect.logWarning(
        `[weather-scheduler] Care readjustment failed for ${label}`,
        { error: String(error) }
      )
    )
  )
}

const readjustPlantSchedule = (
  plant: {
    id: string
    owner: PlantOwner
    name: string
    category: string | null
    wateringRating: number
    lightingRating: number
    humidityRating: number
    remindersEnabled: boolean
    room: {
      id: string
      name: string
      icon: string
      luminosity: number | null
      orientation: Orientation | null
      isOutdoor: boolean
    } | null
  },
  latitude: number,
  weatherCtx: WeatherContext
): Effect.Effect<void, SqlError, ReadjustContext> =>
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

    const nowDt = DateTime.nowUnsafe()
    const nowMs = Number(DateTime.toEpochMillis(nowDt))

    // Compute the schedule delta using forecast-averaged gate model
    const delta = calculateScheduleDelta(
      {
        id: plant.id,
        wateringFrequencyDays: wateringSchedule.frequencyDays,
        wateringRating: plant.wateringRating,
        ...toIndoorPlantContext(plant),
        lastWateredAt: wateringSchedule.lastCareAt,
        nextWateringAt: wateringSchedule.nextCareAt,
        nextFertilizationAt: pipe(
          Option.fromNullishOr(fertSchedule),
          Option.flatMap((s) => Option.fromNullishOr(s.nextCareAt)),
          Option.getOrNull
        ),
        fertilizationFrequencyDays: pipe(
          Option.fromNullishOr(fertSchedule),
          Option.map((s) => s.frequencyDays),
          Option.getOrNull
        ),
      },
      weatherCtx,
      nowMs,
      latitude
    )

    yield* Effect.log(
      `[Readjust] Delta for "${plant.name}": watering=${delta.wateringDaysDelta}d${delta.wateringReason ? ` (${delta.wateringReason})` : ''}, fertilization=${delta.fertilizationDaysDelta}d`
    )

    const oneDayMs = Duration.toMillis(Duration.days(1))

    // Compute schedule changes as immutable result
    const newNextWateringAt = pipe(
      Option.fromNullishOr(wateringSchedule.nextCareAt),
      Option.filter(() => delta.wateringDaysDelta !== 0),
      Option.map(
        (wateringDate) =>
          new Date(wateringDate.getTime() + delta.wateringDaysDelta * oneDayMs)
      )
    )

    const newNextFertilizationAt = pipe(
      Option.fromNullishOr(fertSchedule),
      Option.flatMap((s) => Option.fromNullishOr(s.nextCareAt)),
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
                Option.fromNullishOr(fertSchedule),
                Option.flatMap((s) => Option.fromNullishOr(s.nextCareAt)),
                Option.map((d) => d.toISOString()),
                Option.getOrElse(() => 'none')
              )} → ${newNextFertilizationAt.value.toISOString()})`
            : ''
        }`
      )

      // Reschedule notifications
      if (wateringChanged) {
        yield* scheduleCareReminder({
          plant,
          type: 'watering_reminder',
          scheduledDate: newNextWateringAt.value,
        })
      }

      if (fertilizationChanged) {
        yield* scheduleCareReminder({
          plant,
          type: 'fertilization_reminder',
          scheduledDate: newNextFertilizationAt.value,
        })
      }
    }
  })
