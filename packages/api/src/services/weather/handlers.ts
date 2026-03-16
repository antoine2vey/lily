import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { getCareAdjustments } from '@lily/api/services/weather/endpoints/get-care-adjustments'
import { getWeatherForUser } from '@lily/api/services/weather/endpoints/get-weather'

export const WeatherApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'weather', (handlers) =>
    handlers
      .handle('getWeather', () =>
        getWeatherForUser().pipe(withInfraErrorsAsDefect)
      )
      .handle('getCareAdjustments', () =>
        getCareAdjustments().pipe(withInfraErrorsAsDefect)
      )
  )
