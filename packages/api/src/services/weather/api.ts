import { Authentication } from '@lily/api/services/auth/middleware.types'
import {
  CareAdjustment,
  WeatherFetchError,
  WeatherForecast,
  WeatherNotAvailableError,
} from '@lily/shared'
import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api'

export const WeatherApi = HttpApiGroup.make('weather')
  .add(
    HttpApiEndpoint.get('getWeather', '/', {
      success: WeatherForecast,
      error: [WeatherNotAvailableError, WeatherFetchError],
    })
  )
  .add(
    HttpApiEndpoint.get('getCareAdjustments', '/adjustments', {
      success: Schema.Array(CareAdjustment),
      error: [WeatherNotAvailableError, WeatherFetchError],
    })
  )
  .prefix('/weather')
  .middleware(Authentication)
