import { servicesOf } from '@lily/api/kernel/services'
import { WeatherRepository } from '@lily/api/repositories/weather.repository'
import {
  calculatePlantAdjustment,
  type PlantForAdjustment,
} from '@lily/api/services/weather/algorithm/adjustment'
import { WeatherCache } from '@lily/api/services/weather/cache'
import { getWeatherContext } from '@lily/api/services/weather/helpers/get-weather-context'
import { WeatherProvider } from '@lily/api/services/weather/provider'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import {
  canopies,
  plantCareSchedules,
  plants,
  rooms,
  users,
} from '@lily/db/schema'
import { roundCoord, weatherPlaceOf } from '@lily/shared'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'

interface WeatherProfile {
  readonly latitude: number
  readonly longitude: number
  readonly plant: PlantForAdjustment
}

const DEFAULT_WATERING_FREQUENCY_DAYS = 7

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
    const db = yield* PgDrizzle.PgDrizzle
    const context = yield* servicesOf(
      WeatherProvider,
      WeatherCache,
      WeatherRepository
    )

    const weatherProfiles = Effect.fn('WeatherAdvisor.weatherProfiles')(
      function* (plantIds: ReadonlyArray<string>) {
        if (Array.isReadonlyArrayEmpty(plantIds)) return []
        const rows = yield* db
          .select({
            id: plants.id,
            category: plants.category,
            lightingRating: plants.lightingRating,
            humidityRating: plants.humidityRating,
            wateringRating: plants.wateringRating,
            isOutdoor: rooms.isOutdoor,
            roomLuminosity: rooms.luminosity,
            roomOrientation: rooms.orientation,
            frequencyDays: plantCareSchedules.frequencyDays,
            latitude: sql<
              number | null
            >`case when ${plants.canopyId} is not null then ${canopies.latitude}
                   when ${users.weatherEnabled} then ${users.latitude} end`,
            longitude: sql<
              number | null
            >`case when ${plants.canopyId} is not null then ${canopies.longitude}
                   when ${users.weatherEnabled} then ${users.longitude} end`,
          })
          .from(plants)
          .leftJoin(rooms, eq(rooms.id, plants.roomId))
          .leftJoin(users, eq(users.id, plants.userId))
          .leftJoin(canopies, eq(canopies.id, plants.canopyId))
          .leftJoin(
            plantCareSchedules,
            and(
              eq(plantCareSchedules.plantId, plants.id),
              eq(plantCareSchedules.careType, 'watering')
            )
          )
          .where(inArray(plants.id, [...plantIds]))
        return Array.flatMap(
          rows,
          (row): ReadonlyArray<WeatherProfile> =>
            pipe(
              weatherPlaceOf(row),
              Option.map((place) => ({
                ...place,
                plant: {
                  id: row.id,
                  category: row.category,
                  lightingRating: row.lightingRating,
                  humidityRating: row.humidityRating,
                  wateringRating: row.wateringRating,
                  wateringFrequencyDays:
                    row.frequencyDays ?? DEFAULT_WATERING_FREQUENCY_DAYS,
                  isOutdoor: row.isOutdoor ?? false,
                  roomLuminosity: row.roomLuminosity,
                  roomOrientation: row.roomOrientation,
                },
              })),
              Option.toArray
            )
        )
      }
    )

    return WeatherAdvisor.of({
      wateringDays: (plantIds) =>
        weatherProfiles(plantIds).pipe(
          Effect.flatMap(Effect.forEach(wateringDaysOf, { concurrency: 4 })),
          Effect.map((found) => new Map(Array.getSomes(found))),
          Effect.catchTag('SqlError', Effect.die),
          Effect.provide(context),
          Effect.withSpan('WeatherAdvisor.wateringDays')
        ),
    })
  })
)
