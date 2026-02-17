import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { weatherSnapshots } from '@lily/db'
import { and, desc, eq, lt } from 'drizzle-orm'
import { Array, Context, DateTime, Effect, Layer } from 'effect'

export interface IWeatherRepository {
  readonly upsertSnapshot: (data: {
    latitude: number
    longitude: number
    date: string
    temperatureMin: number | null
    temperatureMax: number | null
    temperatureMean: number | null
    humidity: number | null
    windSpeed: number | null
    precipitation: number | null
    solarRadiation: number | null
    et0: number | null
    cloudCover: number | null
    soilTemperature: number | null
  }) => Effect.Effect<void, SqlError>

  readonly findRecentByLocation: (
    lat: number,
    lng: number,
    days: number
  ) => Effect.Effect<Array<typeof weatherSnapshots.$inferSelect>, SqlError>

  readonly cleanupOldSnapshots: (
    olderThanDays: number
  ) => Effect.Effect<number, SqlError>
}

export class WeatherRepository extends Context.Tag('WeatherRepository')<
  WeatherRepository,
  IWeatherRepository
>() {}

export const WeatherRepositoryLive = Layer.effect(
  WeatherRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      upsertSnapshot: (data) =>
        Effect.gen(function* () {
          yield* db
            .insert(weatherSnapshots)
            .values(data)
            .onConflictDoUpdate({
              target: [
                weatherSnapshots.latitude,
                weatherSnapshots.longitude,
                weatherSnapshots.date,
              ],
              set: {
                temperatureMin: data.temperatureMin,
                temperatureMax: data.temperatureMax,
                temperatureMean: data.temperatureMean,
                humidity: data.humidity,
                windSpeed: data.windSpeed,
                precipitation: data.precipitation,
                solarRadiation: data.solarRadiation,
                et0: data.et0,
                cloudCover: data.cloudCover,
                soilTemperature: data.soilTemperature,
              },
            })
        }),

      findRecentByLocation: (lat, lng, days) =>
        Effect.gen(function* () {
          const cutoffDt = DateTime.subtract(DateTime.unsafeNow(), {
            days,
          })
          const cutoffDateStr = DateTime.formatIsoDateUtc(cutoffDt)

          const results = yield* db
            .select()
            .from(weatherSnapshots)
            .where(
              and(
                eq(weatherSnapshots.latitude, lat),
                eq(weatherSnapshots.longitude, lng)
                // date is stored as ISO date string, lexicographic comparison works
                // We want dates >= cutoffDate
                // Since drizzle doesn't have gte for text easily, filter after
              )
            )
            .orderBy(desc(weatherSnapshots.date))

          // Filter to only recent days (text comparison works for ISO dates)
          return Array.filter(results, (r) => r.date >= cutoffDateStr)
        }),

      cleanupOldSnapshots: (olderThanDays) =>
        Effect.gen(function* () {
          const cutoffDt = DateTime.subtract(DateTime.unsafeNow(), {
            days: olderThanDays,
          })
          const cutoff = DateTime.toDateUtc(cutoffDt)

          const result = yield* db
            .delete(weatherSnapshots)
            .where(lt(weatherSnapshots.createdAt, cutoff))
            .returning()

          return Array.length(result)
        }),
    }
  })
)
