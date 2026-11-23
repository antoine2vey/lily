import { WeatherRepository } from '@lily/api/repositories/weather.repository'
import type { WeatherCache } from '@lily/api/services/weather/cache'
import { getWeatherForLocation } from '@lily/api/services/weather/endpoints/get-weather'
import type { WeatherProvider } from '@lily/api/services/weather/provider'
import type { WeatherData, WeatherFetchError } from '@lily/shared'
import { nowAsIsoString, roundCoord } from '@lily/shared'
import { Array, Effect, Option, pipe, String } from 'effect'

const RECENT_HISTORY_DAYS = 7

export interface WeatherContext {
  readonly currentWeather: WeatherData
  readonly recentHistory: ReadonlyArray<WeatherData>
  readonly forecast: ReadonlyArray<WeatherData>
}

export const getWeatherContext = (
  lat: number,
  lng: number
): Effect.Effect<
  WeatherContext,
  WeatherFetchError,
  WeatherProvider | WeatherCache | WeatherRepository
> =>
  Effect.gen(function* () {
    const weatherRepo = yield* WeatherRepository

    const rlat = roundCoord(lat)
    const rlng = roundCoord(lng)

    const forecast = yield* getWeatherForLocation(rlat, rlng)

    const recentSnapshots = yield* weatherRepo
      .findRecentByLocation(rlat, rlng, RECENT_HISTORY_DAYS)
      .pipe(
        Effect.catchTag('SqlError', () =>
          Effect.succeed(
            [] as ReadonlyArray<{
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
            }>
          )
        )
      )

    const recentHistory: ReadonlyArray<WeatherData> = Array.map(
      recentSnapshots,
      (snap) => ({
        date: snap.date,
        temperatureMin: snap.temperatureMin,
        temperatureMax: snap.temperatureMax,
        temperatureMean: snap.temperatureMean,
        humidity: snap.humidity,
        windSpeed: snap.windSpeed,
        precipitation: snap.precipitation,
        solarRadiation: snap.solarRadiation,
        et0: snap.et0,
        cloudCover: snap.cloudCover,
        soilTemperature: snap.soilTemperature,
      })
    )

    const currentWeather: WeatherData = Option.getOrElse(
      Array.head(forecast.daily),
      () =>
        ({
          date: pipe(nowAsIsoString(), String.split('T'), Array.headNonEmpty),
          temperatureMin: null,
          temperatureMax: null,
          temperatureMean: null,
          humidity: null,
          windSpeed: null,
          precipitation: null,
          solarRadiation: null,
          et0: null,
          cloudCover: null,
          soilTemperature: null,
        }) satisfies WeatherData
    )

    return {
      currentWeather,
      recentHistory,
      forecast: forecast.daily,
    }
  })
