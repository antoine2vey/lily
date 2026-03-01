import type { SqlError } from '@effect/sql/SqlError'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { WeatherRepository } from '@lily/api/repositories/weather.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { calculatePlantAdjustment } from '@lily/api/services/weather/algorithm'
import type { WeatherCache } from '@lily/api/services/weather/cache'
import { getWeatherForLocation } from '@lily/api/services/weather/endpoints/get-weather'
import type { WeatherProvider } from '@lily/api/services/weather/provider'
import type { CareAdjustment, WeatherData } from '@lily/shared'
import {
  nowAsIsoString,
  roundCoord,
  type WeatherFetchError,
  WeatherNotAvailableError,
} from '@lily/shared'
import { Array, Effect, Option, pipe, String } from 'effect'

export const getCareAdjustments = (): Effect.Effect<
  ReadonlyArray<CareAdjustment>,
  SqlError | WeatherFetchError | WeatherNotAvailableError,
  | CurrentUser
  | UserRepository
  | PlantRepository
  | WeatherProvider
  | WeatherCache
  | WeatherRepository
> =>
  Effect.gen(function* () {
    const { id } = yield* CurrentUser
    const userRepo = yield* UserRepository
    const plantRepo = yield* PlantRepository
    const weatherRepo = yield* WeatherRepository

    // Get user and verify weather is enabled
    const user = yield* userRepo.findById(id)
    if (!user || !user.weatherEnabled || !user.latitude || !user.longitude) {
      return yield* Effect.fail(new WeatherNotAvailableError({}))
    }

    const rlat = roundCoord(user.latitude)
    const rlng = roundCoord(user.longitude)

    // Fetch current weather forecast
    const forecast = yield* getWeatherForLocation(rlat, rlng)

    // Get the user's plants
    const plantsResult = yield* plantRepo.findAll({
      userId: id,
      timezone: user.timezone || 'UTC',
      page: 1,
      limit: 1000,
    })

    // Get recent weather history for multi-day trend analysis
    const recentSnapshots = yield* weatherRepo
      .findRecentByLocation(rlat, rlng, 7)
      .pipe(
        Effect.catchTag('SqlError', () =>
          Effect.succeed(
            [] as Array<
              typeof import('@lily/db/schema').weatherSnapshots.$inferSelect
            >
          )
        )
      )

    // Convert snapshots to WeatherData format
    const recentHistory: ReadonlyArray<WeatherData> = Array.map(
      recentSnapshots,
      (snap) => ({
        date: snap.date,
        temperatureMin: snap.temperatureMin,
        temperatureMax: snap.temperatureMax,
        temperatureMean: snap.temperatureMean,
        humidity: snap.humidity,
        windSpeed: snap.windSpeed,
        precipitation: snap.precipitation,
        solarRadiation: snap.solarRadiation,
        et0: snap.et0,
        cloudCover: snap.cloudCover,
        soilTemperature: snap.soilTemperature,
      })
    )

    // Get today's weather (first day of forecast)
    const currentWeather = Option.getOrElse(
      Array.head(forecast.daily),
      () =>
        ({
          date: pipe(nowAsIsoString(), String.split('T'), Array.headNonEmpty),
          temperatureMin: null,
          temperatureMax: null,
          temperatureMean: null,
          humidity: null,
          windSpeed: null,
          precipitation: null,
          solarRadiation: null,
          et0: null,
          cloudCover: null,
          soilTemperature: null,
        }) satisfies WeatherData
    )

    // Calculate adjustments for each plant
    return Array.map(plantsResult.items, (plant) =>
      calculatePlantAdjustment(
        {
          id: plant.id,
          category: plant.category,
          wateringFrequencyDays: plant.wateringFrequencyDays,
          wateringRating: plant.wateringRating,
          isOutdoor: plant.room?.isOutdoor ?? false,
        },
        currentWeather,
        recentHistory,
        forecast.daily
      )
    )
  })
