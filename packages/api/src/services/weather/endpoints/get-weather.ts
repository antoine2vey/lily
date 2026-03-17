import type { SqlError } from '@effect/sql/SqlError'
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
} from '@lily/shared'
import { Effect, Option } from 'effect'

// Fetch weather for a specific location (with cache + persistence)
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

    // Check Redis cache first
    const cached = yield* cache.findNearest(rlat, rlng, WEATHER_ZONE_RADIUS_KM)

    if (Option.isSome(cached)) {
      return cached.value
    }

    // Cache miss — fetch from provider
    const forecast = yield* provider.fetchForecast(rlat, rlng)

    // Store in Redis cache
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

// Fetch weather for the current authenticated user
export const getWeatherForUser = (): Effect.Effect<
  WeatherForecast,
  SqlError | WeatherFetchError | WeatherNotAvailableError,
  | CurrentUser
  | UserRepository
  | WeatherProvider
  | WeatherCache
  | WeatherRepository
> =>
  Effect.gen(function* () {
    const { id } = yield* CurrentUser
    const userRepo = yield* UserRepository

    const user = yield* userRepo.findById(id)

    if (!user || !user.weatherEnabled || !user.latitude || !user.longitude) {
      return yield* new WeatherNotAvailableError({})
    }

    return yield* getWeatherForLocation(user.latitude, user.longitude)
  })
