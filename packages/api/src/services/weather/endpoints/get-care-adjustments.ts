import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import type { WeatherRepository } from '@lily/api/repositories/weather.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import {
  calculatePlantAdjustment,
  toIndoorPlantContext,
} from '@lily/api/services/weather/algorithm'
import type { WeatherCache } from '@lily/api/services/weather/cache'
import { getWeatherContext } from '@lily/api/services/weather/helpers/get-weather-context'
import type { WeatherProvider } from '@lily/api/services/weather/provider'
import type { CareAdjustment } from '@lily/shared'
import { type WeatherFetchError, WeatherNotAvailableError } from '@lily/shared'
import { Array, Effect, Filter, Option, pipe } from 'effect'
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

  const user = yield* userRepo.findById(id)
  if (!user || !user.weatherEnabled || !user.latitude || !user.longitude) {
    return yield* new WeatherNotAvailableError({})
  }

  const { currentWeather, recentHistory, forecast } = yield* getWeatherContext(
    user.latitude,
    user.longitude
  )

  const plantsResult = yield* plantRepo.findAll({
    userId: id,
    page: 1,
    limit: 1000,
  })

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
          forecast,
          user.latitude
        )
      )
    })
  )
})
