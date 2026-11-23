import type { WeatherFetchError, WeatherForecast } from '@lily/shared'
import { Context, type Effect } from 'effect'

export interface IWeatherProvider {
  readonly name: string
  readonly fetchForecast: (
    lat: number,
    lng: number,
    forecastDays?: number
  ) => Effect.Effect<WeatherForecast, WeatherFetchError>
}

// The service tag consumed by the rest of the app.
// The live implementation is a FallbackWeatherProvider that wraps concrete providers.
export class WeatherProvider extends Context.Service<
  WeatherProvider,
  IWeatherProvider
>()('WeatherProvider') {}
