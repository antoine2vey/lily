import type { IWeatherProvider } from '@lily/api/services/weather/provider'
import { WeatherFetchError, type WeatherForecast } from '@lily/shared'
import { Array, Effect, pipe } from 'effect'

// Tries providers in order. On first success, returns immediately.
// On failure, logs a warning and tries the next provider.
// If all providers fail, returns the last error.
export const createFallbackProvider = (
  providers: ReadonlyArray<IWeatherProvider>
): IWeatherProvider => ({
  name: 'FallbackWeatherProvider',

  fetchForecast: (lat, lng, forecastDays) =>
    pipe(
      providers,
      Array.reduce(
        Effect.fail(
          new WeatherFetchError({ message: 'No providers configured' })
        ) as Effect.Effect<WeatherForecast, WeatherFetchError>,
        (fallback, provider) =>
          Effect.catchTag(fallback, 'WeatherFetchError', () =>
            provider.fetchForecast(lat, lng, forecastDays).pipe(
              Effect.tap(() =>
                Effect.log(`Weather fetched from ${provider.name}`)
              ),
              Effect.catchTag('WeatherFetchError', (error) =>
                Effect.gen(function* () {
                  yield* Effect.logWarning(
                    `${provider.name} failed, trying next: ${error.message}`
                  )
                  return yield* error
                })
              )
            )
          )
      )
    ),
})
