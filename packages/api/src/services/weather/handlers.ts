import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { WeatherRepositoryLive } from '@lily/api/repositories/weather.repository'
import { AuthenticationLive } from '@lily/api/services/auth/middleware.impl'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { RedisClientLive } from '@lily/api/services/message-queue/redis.provider'
import { WeatherCacheLive } from '@lily/api/services/weather/cache.live'
import { WeatherProviderLive } from '@lily/api/services/weather/provider.live'
import { WeatherService } from '@lily/api/services/weather/service'
import { Effect, Layer } from 'effect'

export const WeatherApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'weather', (handlers) =>
    Effect.gen(function* () {
      const weatherService = yield* WeatherService

      return handlers
        .handle('getWeather', () =>
          weatherService.getWeatherForUser().pipe(withInfraErrorsAsDefect)
        )
        .handle('getCareAdjustments', () =>
          weatherService.getCareAdjustments().pipe(withInfraErrorsAsDefect)
        )
    })
  ).pipe(
    Layer.provide(WeatherService.Default),
    Layer.provide(WeatherProviderLive),
    Layer.provide(WeatherCacheLive),
    Layer.provide(WeatherRepositoryLive),
    Layer.provide(PlantRepositoryLive),
    Layer.provide(CareScheduleRepositoryLive),
    Layer.provide(UserRepositoryLive),
    Layer.provide(RedisClientLive),
    Layer.provide(AuthenticationLive)
  )
