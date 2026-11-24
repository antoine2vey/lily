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
  | WeatherProvider
  | WeatherCache
  | WeatherRepository
> = Effect.gen(function* () {
  const { id } = yield* CurrentUser
  const userRepo = yield* UserRepository
  const plantRepo = yield* PlantRepository

  const user = yield* userRepo.findById(id)
  if (!user || !user.weatherEnabled || !user.latitude || !user.longitude) {
    return yield* new WeatherNotAvailableError({})
  }

  const { currentWeather, recentHistory, forecast } = yield* getWeatherContext(
    user.latitude,
    user.longitude
  )
  const plants = yield* plantRepo.findLivingByOwner({
    _tag: 'User',
    userId: id,
  })

  return Array.filterMap(
    plants,
    Filter.fromPredicateOption((plant) =>
      pipe(
        Array.findFirst(plant.schedules, (s) => s.careType === 'watering'),
        Option.map((wateringSchedule) =>
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
      )
    )
  )
})
