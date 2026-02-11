import type { WeatherForecast } from '@lily/shared'
import { Context, type Effect, type Option } from 'effect'

export interface IWeatherCache {
  readonly findNearest: (
    lat: number,
    lng: number,
    radiusKm: number
  ) => Effect.Effect<Option.Option<WeatherForecast>>

  readonly store: (
    lat: number,
    lng: number,
    data: WeatherForecast
  ) => Effect.Effect<void>

  readonly getAllLocations: () => Effect.Effect<
    Array<{ latitude: number; longitude: number; id: string }>
  >

  readonly removeLocation: (id: string) => Effect.Effect<void>
}

export class WeatherCache extends Context.Tag('WeatherCache')<
  WeatherCache,
  IWeatherCache
>() {}
