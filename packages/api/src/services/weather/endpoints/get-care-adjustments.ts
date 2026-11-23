import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { WeatherRepository } from '@lily/api/repositories/weather.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import {
  calculatePlantAdjustment,
  toIndoorPlantContext,
} from '@lily/api/services/weather/algorithm'
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
import { Array, Effect, Filter, Option, pipe, String } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const getCareAdjustments: Effect.Effect<
  ReadonlyArray<CareAdjustment>,
  SqlError | WeatherFetchError | WeatherNotAvailableError,
  | CurrentUser
  | UserRepository
  | PlantRepository
  | CareScheduleRepository
  | WeatherProvider
  | WeatherCache
  | WeatherRepository
> = Effect.gen(function* () {
  const { id } = yield* CurrentUser
  const userRepo = yield* UserRepository
  const plantRepo = yield* PlantRepository
  const scheduleRepo = yield* CareScheduleRepository
  const weatherRepo = yield* WeatherRepository

  const user = yield* userRepo.findById(id)
  if (!user || !user.weatherEnabled || !user.latitude || !user.longitude) {
    return yield* new WeatherNotAvailableError({})
  }

  const rlat = roundCoord(user.latitude)
  const rlng = roundCoord(user.longitude)

  const forecast = yield* getWeatherForLocation(rlat, rlng)

  const plantsResult = yield* plantRepo.findAll({
    userId: id,
    page: 1,
    limit: 1000,
  })

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

  const allSchedules = yield* Effect.forEach(
    plantsResult.items,
    (plant) => scheduleRepo.findByPlant(plant.id),
    { concurrency: 10 }
  )

  return Array.filterMap(
    Array.zip(plantsResult.items, allSchedules),
    Filter.fromPredicateOption(([plant, schedules]) => {
      const wateringSchedule = pipe(
        Array.findFirst(schedules, (s) => s.careType === 'watering'),
        Option.getOrNull
      )

      if (!wateringSchedule) {
        return Option.none()
      }

      return Option.some(
        calculatePlantAdjustment(
          {
            id: plant.id,
            wateringFrequencyDays: wateringSchedule.frequencyDays,
            wateringRating: plant.wateringRating,
            ...toIndoorPlantContext(plant),
          },
          currentWeather,
          recentHistory,
          forecast.daily,
          user.latitude
        )
      )
    })
  )
})
