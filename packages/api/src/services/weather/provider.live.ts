import { WeatherProvider } from '@lily/api/services/weather/provider'
import { createFallbackProvider } from '@lily/api/services/weather/providers/fallback.provider'
import { createOpenMeteoProvider } from '@lily/api/services/weather/providers/open-meteo.provider'
import { createOpenWeatherMapProvider } from '@lily/api/services/weather/providers/openweathermap.provider'
import { Config, Effect, Layer, pipe, String } from 'effect'

export const WeatherProviderLive = Layer.effect(
  WeatherProvider,
  Effect.gen(function* () {
    const openMeteo = createOpenMeteoProvider()

    // OpenWeatherMap is optional (needs API key)
    const owmApiKey = yield* Config.string('OPENWEATHERMAP_API_KEY').pipe(
      Config.withDefault('')
    )

    const providers = pipe(owmApiKey, (key) =>
      String.length(key) > 0
        ? [openMeteo, createOpenWeatherMapProvider(key)]
        : [openMeteo]
    )

    return createFallbackProvider(providers)
  })
)
