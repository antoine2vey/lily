import {
  type IWeatherRepository,
  WeatherRepository,
} from '@lily/api/repositories/weather.repository'
import type { weatherSnapshots } from '@lily/db'
import { Array, Effect, Layer, pipe } from 'effect'

export const createMockWeatherRepository = (
  snapshots: Array<typeof weatherSnapshots.$inferSelect> = []
): Layer.Layer<WeatherRepository> => {
  const repo: IWeatherRepository = {
    upsertSnapshot: () => Effect.succeed(undefined),

    findRecentByLocation: (lat, lng, _days) =>
      Effect.succeed(
        pipe(
          snapshots,
          Array.filter((s) => s.latitude === lat && s.longitude === lng)
        )
      ),

    cleanupOldSnapshots: () => Effect.succeed(0),
  }

  return Layer.succeed(WeatherRepository, repo)
}
