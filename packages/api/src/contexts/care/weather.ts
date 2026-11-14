import { CareStore, type WeatherProfile } from '@lily/api/contexts/care/store'
import type { WeatherRepository } from '@lily/api/repositories/weather.repository'
import { calculatePlantAdjustment } from '@lily/api/services/weather/algorithm'
import type { WeatherCache } from '@lily/api/services/weather/cache'
import { getWeatherContext } from '@lily/api/services/weather/helpers/get-weather-context'
import type { WeatherProvider } from '@lily/api/services/weather/provider'
import { roundCoord } from '@lily/shared'
import { Array, Context, Effect, Layer, Option } from 'effect'

export class WeatherAdvisor extends Context.Service<
  WeatherAdvisor,
  {
    readonly wateringDays: (
      plantIds: ReadonlyArray<string>
    ) => Effect.Effect<ReadonlyMap<string, number>>
  }
>()('care/WeatherAdvisor') {}

const wateringDaysOf = ({ latitude, longitude, plant }: WeatherProfile) =>
  getWeatherContext(roundCoord(latitude), roundCoord(longitude)).pipe(
    Effect.map(({ currentWeather, recentHistory, forecast }) =>
      Option.some([
        plant.id,
        calculatePlantAdjustment(
          plant,
          currentWeather,
          recentHistory,
          forecast,
          latitude
        ).adjustedWateringDays,
      ] as const)
    ),
    Effect.catchTag('WeatherFetchError', () => Effect.succeedNone)
  )

export const WeatherAdvisorLive = Layer.effect(
  WeatherAdvisor,
  Effect.gen(function* () {
    const store = yield* CareStore
    const context = yield* Effect.context<
      WeatherProvider | WeatherCache | WeatherRepository
    >()
    return WeatherAdvisor.of({
      wateringDays: (plantIds) =>
        store.weatherProfiles(plantIds).pipe(
          Effect.flatMap(Effect.forEach(wateringDaysOf, { concurrency: 4 })),
          Effect.map((found) => new Map(Array.getSomes(found))),
          Effect.catchTag('SqlError', Effect.die),
          Effect.provide(context),
          Effect.withSpan('WeatherAdvisor.wateringDays')
        ),
    })
  })
)
