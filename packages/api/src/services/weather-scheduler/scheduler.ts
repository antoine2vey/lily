import type { SqlError } from '@effect/sql/SqlError'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { WeatherRepository } from '@lily/api/repositories/weather.repository'
import { getWeatherForLocation } from '@lily/api/services/weather/endpoints/get-weather'
import {
  getWeatherContext,
  type WeatherContext,
} from '@lily/api/services/weather/helpers/get-weather-context'
import { readjustCareSchedules } from '@lily/api/services/weather-scheduler/readjust-care-schedules'
import { roundCoord, WEATHER_FETCH_HOURS } from '@lily/shared'
import { Array, DateTime, Effect, Option, pipe, Record } from 'effect'
import type { DurationInput } from 'effect/Duration'

// Check every hour whether we should fetch weather
const POLL_INTERVAL: DurationInput = '1 hour'

// Cleanup snapshots older than this many days (once per day)
const CLEANUP_OLDER_THAN_DAYS = 30

// Fetch weather for all active locations
const refreshWeatherData = Effect.gen(function* () {
  const userRepo = yield* UserRepository
  const weatherRepo = yield* WeatherRepository

  yield* Effect.log('Running weather data refresh...')

  // Get users with weather enabled (filtered at DB level)
  const weatherUsers = yield* userRepo.findWeatherEnabled()

  if (Array.isEmptyArray(weatherUsers)) {
    yield* Effect.log('No users with weather enabled, skipping')
    return
  }

  // Check if current UTC hour is a fetch hour for at least one timezone
  const nowDt = DateTime.unsafeNow()
  const utcHour = DateTime.toParts(nowDt).hours

  // Collect distinct locations (rounded to 2dp)
  const locationRecord = Array.reduce(
    weatherUsers,
    {} as globalThis.Record<
      string,
      { lat: number; lng: number; timezones: ReadonlyArray<string> }
    >,
    (acc, user) => {
      const lat = roundCoord(user.latitude as number)
      const lng = roundCoord(user.longitude as number)
      const key = `${lat}_${lng}`
      const tz = user.timezone || 'UTC'
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

  // Filter locations where at least one user's local hour matches a fetch hour
  const locationsToFetch = pipe(
    Record.values(locationRecord),
    Array.filter((loc) =>
      Array.some(loc.timezones, (tz) => {
        const zoned = DateTime.unsafeMakeZoned(nowDt, {
          timeZone: tz,
          adjustForTimeZone: true,
        })
        const localHour = DateTime.toParts(zoned).hours
        return Array.contains(WEATHER_FETCH_HOURS, localHour)
      })
    )
  )

  if (Array.isEmptyArray(locationsToFetch)) {
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
            `Weather refresh failed for ${loc.lat},${loc.lng}`,
            { error }
          )
        )
      ),
    { concurrency: 5 }
  )

  // Build weather context map (one per distinct location, reused across users)
  const weatherContextResults = yield* Effect.forEach(
    locationsToFetch,
    (loc) =>
      getWeatherContext(loc.lat, loc.lng).pipe(
        Effect.map((ctx) =>
          Option.some([`${loc.lat}_${loc.lng}`, ctx] as const)
        ),
        Effect.catchTag('WeatherFetchError', (error) =>
          Effect.logWarning(
            `Weather context build failed for ${loc.lat},${loc.lng}`,
            { error }
          ).pipe(
            Effect.map(() => Option.none<readonly [string, WeatherContext]>())
          )
        )
      ),
    { concurrency: 5 }
  )

  const weatherContextMap: ReadonlyMap<string, WeatherContext> = new Map(
    Array.filterMap(weatherContextResults, (opt) => opt)
  )

  // Readjust care schedules, passing the already-fetched users and pre-built contexts
  yield* readjustCareSchedules(weatherUsers, weatherContextMap)

  // Run cleanup once per day (when UTC hour is 0)
  if (utcHour === 0) {
    const cleaned = yield* weatherRepo
      .cleanupOldSnapshots(CLEANUP_OLDER_THAN_DAYS)
      .pipe(
        Effect.catchTag('SqlError', (error) =>
          Effect.logWarning('Snapshot cleanup failed', { error }).pipe(
            Effect.map(() => 0)
          )
        )
      )
    if (cleaned > 0) {
      yield* Effect.log(`Cleaned up ${cleaned} old weather snapshots`)
    }
  }
})

// Start the weather scheduler as a background process
export const startWeatherScheduler = Effect.gen(function* () {
  // Run immediately on startup
  yield* refreshWeatherData.pipe(
    Effect.catchTag('SqlError', (error: SqlError) =>
      Effect.logError('Weather scheduler initial refresh error', error)
    )
  )

  // Then run periodically
  yield* Effect.fork(
    Effect.forever(
      Effect.sleep(POLL_INTERVAL).pipe(
        Effect.zipRight(
          refreshWeatherData.pipe(
            Effect.catchTag('SqlError', (error: SqlError) =>
              Effect.logError('Weather scheduler polling error', error)
            )
          )
        )
      )
    )
  )

  yield* Effect.log('Weather scheduler started')
})
