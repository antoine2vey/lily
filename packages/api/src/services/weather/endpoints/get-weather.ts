import { UserRepository } from '@lily/api/repositories/user.repository'
import { WeatherRepository } from '@lily/api/repositories/weather.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { WeatherCache } from '@lily/api/services/weather/cache'
import { WeatherProvider } from '@lily/api/services/weather/provider'
import type { WeatherForecast } from '@lily/shared'
import {
  roundCoord,
  WEATHER_ZONE_RADIUS_KM,
  type WeatherFetchError,
  WeatherNotAvailableError,
  weatherPlaceOf,
} from '@lily/shared'
import { Effect, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const getWeatherForLocation = (
  lat: number,
  lng: number
): Effect.Effect<
  WeatherForecast,
  WeatherFetchError,
  WeatherProvider | WeatherCache | WeatherRepository
> =>
  Effect.gen(function* () {
    const cache = yield* WeatherCache
    const provider = yield* WeatherProvider
    const weatherRepo = yield* WeatherRepository

    const rlat = roundCoord(lat)
    const rlng = roundCoord(lng)

    const cached = yield* cache.findNearest(rlat, rlng, WEATHER_ZONE_RADIUS_KM)

    if (Option.isSome(cached)) {
      return cached.value
    }

    const forecast = yield* provider.fetchForecast(rlat, rlng)

    yield* cache.store(rlat, rlng, forecast)

    // Persist daily snapshots to PostgreSQL for historical trend analysis
    yield* Effect.forEach(
      forecast.daily,
      (day) =>
        weatherRepo
          .upsertSnapshot({
            latitude: rlat,
            longitude: rlng,
            date: day.date,
            temperatureMin: day.temperatureMin,
            temperatureMax: day.temperatureMax,
            temperatureMean: day.temperatureMean,
            humidity: day.humidity,
            windSpeed: day.windSpeed,
            precipitation: day.precipitation,
            solarRadiation: day.solarRadiation,
            et0: day.et0,
            cloudCover: day.cloudCover,
            soilTemperature: day.soilTemperature,
          })
          .pipe(
            Effect.catchTag('SqlError', (error) =>
              Effect.logWarning('Failed to persist weather snapshot', {
                error,
                date: day.date,
              })
            )
          ),
      { concurrency: 5 }
    )

    return forecast
  })

/** A user's coordinates, when weather is on. */
export const userWeatherPlace = (
  user: {
    readonly weatherEnabled: boolean
    readonly latitude: number | null
    readonly longitude: number | null
  } | null
): Effect.Effect<
  { readonly latitude: number; readonly longitude: number },
  WeatherNotAvailableError
> =>
  Effect.fromOption(
    pipe(
      Option.fromNullishOr(user),
      Option.filter((u) => u.weatherEnabled),
      Option.flatMap(weatherPlaceOf)
    ),
    () => new WeatherNotAvailableError({})
  )

export const getWeatherForUser: Effect.Effect<
  WeatherForecast,
  SqlError | WeatherFetchError | WeatherNotAvailableError,
  | CurrentUser
  | UserRepository
  | WeatherProvider
  | WeatherCache
  | WeatherRepository
> = Effect.gen(function* () {
  const { id } = yield* CurrentUser
  const userRepo = yield* UserRepository

  const { latitude, longitude } = yield* userWeatherPlace(
    yield* userRepo.findById(id)
  )
  return yield* getWeatherForLocation(latitude, longitude)
})
