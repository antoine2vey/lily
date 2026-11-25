import { Care, DueMove } from '@lily/api/contexts/care'
import type { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import {
  calculateScheduleDelta,
  toIndoorPlantContext,
} from '@lily/api/services/weather/algorithm/adjustment'
import type { WeatherContext } from '@lily/api/services/weather/helpers/get-weather-context'
import {
  CanopyId,
  type PlantOwner,
  roundCoord,
  type ZoneName,
} from '@lily/shared'
import {
  Array,
  DateTime,
  Effect,
  Match,
  Option,
  pipe,
  String as Str,
} from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export interface WeatherScope {
  readonly owner: PlantOwner
  readonly latitude: number
  readonly longitude: number
  readonly timezone: ZoneName
}

interface LocatedRow {
  readonly id: string
  readonly latitude: number | null
  readonly longitude: number | null
  readonly timezone: ZoneName | null
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
        canopyId: CanopyId.make(canopy.id),
      })
    ),
  ])

export const weatherLocationKey = (latitude: number, longitude: number) =>
  `${roundCoord(latitude)}_${roundCoord(longitude)}`

type ReadjustContext =
  | Care
  | PlantRepository
  | NotificationRepository
  | UserRepository
  | DelegationRepository
  | CanopyRepository
  | SqlClient.SqlClient

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
  const label = pipe(
    Match.value(scope.owner),
    Match.tag('User', ({ userId }) => `user ${userId}`),
    Match.tag('Canopy', ({ canopyId }) => `canopy ${canopyId}`),
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

    const plantRepo = yield* PlantRepository
    const plants = yield* plantRepo.findLivingByOwner(scope.owner)

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
  plant: PlantWithRoom,
  latitude: number,
  weatherCtx: WeatherContext
): Effect.Effect<void, SqlError, ReadjustContext> =>
  Effect.gen(function* () {
    const care = yield* Care

    const wateringSchedule = pipe(
      Array.findFirst(plant.schedules, (s) => s.careType === 'watering'),
      Option.getOrNull
    )

    const fertSchedule = pipe(
      Array.findFirst(plant.schedules, (s) => s.careType === 'fertilization'),
      Option.getOrNull
    )

    if (!wateringSchedule?.lastCareAt) {
      yield* Effect.log(
        `[Readjust] Skipping plant "${plant.name}" (${plant.id}): no watering schedule or no care yet`
      )
      return
    }

    yield* Effect.log(
      `[Readjust] Evaluating plant "${plant.name}" (${plant.id}): freq=${wateringSchedule.frequencyDays}d, lastWatered=${wateringSchedule.lastCareAt.toISOString()}, nextWatering=${wateringSchedule.nextCareAt.toISOString()}`
    )

    const nowDt = DateTime.nowUnsafe()
    const nowMs = Number(DateTime.toEpochMillis(nowDt))

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
          Option.map((s) => s.nextCareAt),
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

    const moves = Array.filter(
      [
        { careType: 'watering' as const, days: delta.wateringDaysDelta },
        {
          careType: 'fertilization' as const,
          days: delta.fertilizationDaysDelta,
        },
      ],
      (move) => move.days !== 0
    )
    yield* care.moveDueDays({
      reason: 'weather',
      moves: Array.map(moves, ({ careType, days }) => ({
        plantId: plant.id,
        careType,
        move: DueMove.By({ days }),
      })),
    })
    if (Array.isReadonlyArrayNonEmpty(moves)) {
      yield* Effect.log(
        `[Readjust] MOVED plant "${plant.name}" (${plant.id}): ${Array.join(
          Array.map(moves, (move) => `${move.careType} by ${move.days}d`),
          ', '
        )}`
      )
    }
  })
