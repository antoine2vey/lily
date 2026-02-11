import {
  type IWeatherProvider,
  WeatherProvider,
} from '@lily/api/services/weather/provider'
import type { WeatherForecast } from '@lily/shared'
import { WeatherFetchError } from '@lily/shared'
import { Effect, Layer } from 'effect'

export const createMockWeatherProvider = (
  forecast?: WeatherForecast
): Layer.Layer<WeatherProvider> => {
  const provider: IWeatherProvider = {
    name: 'MockWeatherProvider',
    fetchForecast: () =>
      forecast
        ? Effect.succeed(forecast)
        : Effect.fail(
            new WeatherFetchError({ message: 'Mock provider: no data' })
          ),
  }

  return Layer.succeed(WeatherProvider, provider)
}
