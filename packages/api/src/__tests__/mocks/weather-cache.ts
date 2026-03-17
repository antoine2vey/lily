import {
  type IWeatherCache,
  WeatherCache,
} from '@lily/api/services/weather/cache'
import type { WeatherForecast } from '@lily/shared'
import { Effect, Layer, Option } from 'effect'

export const createMockWeatherCache = (
  cachedForecast?: WeatherForecast
): Layer.Layer<WeatherCache> => {
  const cache: IWeatherCache = {
    findNearest: () =>
      Effect.succeed(
        cachedForecast ? Option.some(cachedForecast) : Option.none()
      ),

    store: () => Effect.void,

    getAllLocations: () => Effect.succeed([]),

    removeLocation: () => Effect.void,
  }

  return Layer.succeed(WeatherCache, cache)
}
