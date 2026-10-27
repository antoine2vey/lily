import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { WeatherRepository } from '@lily/api/repositories/weather.repository'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import { getWeatherForLocation } from '@lily/api/services/weather/endpoints/get-weather'
import {
  getWeatherContext,
  type WeatherContext,
} from '@lily/api/services/weather/helpers/get-weather-context'
import {
  readjustCareSchedules,
  weatherLocationKey,
  weatherScopes,
} from '@lily/api/services/weather-scheduler/readjust-care-schedules'
import { roundCoord, WEATHER_FETCH_HOURS } from '@lily/shared'
import { Array, DateTime, Effect, Option, pipe, Record } from 'effect'

// Cleanup snapshots older than this many days (once per day)
const CLEANUP_OLDER_THAN_DAYS = 30

export const isWeatherFetchHour = (
  now: DateTime.Utc,
  timeZone: string
): boolean =>
  pipe(
    DateTime.zoneMakeNamed(timeZone),
    Option.map((zone) => DateTime.toParts(DateTime.setZone(now, zone)).hour),
    Option.getOrElse(() => DateTime.toParts(now).hour),
    (hour) => Array.contains(WEATHER_FETCH_HOURS, hour)
  )

// Fetch weather for all active locations
const refreshWeatherData = Effect.gen(function* () {
  const userRepo = yield* UserRepository
  const canopyRepo = yield* CanopyRepository
  const weatherRepo = yield* WeatherRepository

  yield* Effect.log('Running weather data refresh...')

  const scopes = weatherScopes(
    yield* userRepo.findWeatherEnabled(),
    yield* canopyRepo.findWithLocation()
  )

  if (Array.isReadonlyArrayEmpty(scopes)) {
    yield* Effect.log('No users or Canopies with a weather location, skipping')
    return
  }

  // Check if current UTC hour is a fetch hour for at least one timezone
  const nowDt = DateTime.nowUnsafe()
  const utcHour = DateTime.toParts(nowDt).hour

  // Collect distinct locations (rounded to 2dp)
  const locationRecord = Array.reduce(
    scopes,
    {} as globalThis.Record<
      string,
      { lat: number; lng: number; timezones: ReadonlyArray<string> }
    >,
    (acc, scope) => {
      const lat = roundCoord(scope.latitude)
      const lng = roundCoord(scope.longitude)
      const key = weatherLocationKey(scope.latitude, scope.longitude)
      const tz = scope.timezone
      const existing = acc[key]
      return {
        ...acc,
        [key]: existing
          ? {
              ...existing,
              timezones: Array.contains(existing.timezones, tz)
                ? existing.timezones
                : Array.append(existing.timezones, tz),
            }
          : { lat, lng, timezones: [tz] },
      }
    }
  )

  const locationsToFetch = pipe(
    Record.values(locationRecord),
    Array.filter((loc) =>
      Array.some(loc.timezones, (tz) => isWeatherFetchHour(nowDt, tz))
    )
  )

  if (Array.isArrayEmpty(locationsToFetch)) {
    yield* Effect.log('No locations need refresh at current hour')
    return
  }

  yield* Effect.log(`Fetching weather for ${locationsToFetch.length} locations`)

  // Fetch weather for each location with concurrency limit
  yield* Effect.forEach(
    locationsToFetch,
    (loc) =>
      getWeatherForLocation(loc.lat, loc.lng).pipe(
        Effect.tap(() =>
          Effect.log(`Weather refreshed for ${loc.lat},${loc.lng}`)
        ),
        Effect.catchTag('WeatherFetchError', (error) =>
          Effect.logWarning(
            `[weather-scheduler] Fetch failed for ${loc.lat},${loc.lng}`,
            { error: String(error) }
          )
        )
      ),
    { concurrency: 5 }
  )

  const weatherContextResults = yield* Effect.forEach(
    locationsToFetch,
    (loc) =>
      getWeatherContext(loc.lat, loc.lng).pipe(
        Effect.map((ctx) =>
          Option.some([weatherLocationKey(loc.lat, loc.lng), ctx] as const)
        ),
        Effect.catchTag('WeatherFetchError', (error) =>
          Effect.logWarning(
            `[weather-scheduler] Context build failed for ${loc.lat},${loc.lng}`,
            { error: String(error) }
          ).pipe(
            Effect.map(() => Option.none<readonly [string, WeatherContext]>())
          )
        )
      ),
    { concurrency: 5 }
  )

  const weatherContextMap: ReadonlyMap<string, WeatherContext> = new Map(
    Array.getSomes(weatherContextResults)
  )

  yield* readjustCareSchedules(scopes, weatherContextMap)

  // Run cleanup once per day (when UTC hour is 0)
  if (utcHour === 0) {
    const cleaned = yield* weatherRepo
      .cleanupOldSnapshots(CLEANUP_OLDER_THAN_DAYS)
      .pipe(
        Effect.catchTag('SqlError', (error) =>
          Effect.logWarning('[weather-scheduler] Snapshot cleanup failed', {
            error: String(error),
          }).pipe(Effect.map(() => 0))
        )
      )
    if (cleaned > 0) {
      yield* Effect.log(`Cleaned up ${cleaned} old weather snapshots`)
    }
  }
})

export const startWeatherScheduler = createScheduler({
  name: 'weather-scheduler',
  interval: '1 hour',
  runOnStartup: true,
  task: refreshWeatherData,
})
