import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { Authentication } from '@lily/api/services/auth/middleware.types'
import {
  CareAdjustment,
  WeatherFetchError,
  WeatherForecast,
  WeatherNotAvailableError,
} from '@lily/shared'
import { Schema } from 'effect'

export const WeatherApi = HttpApiGroup.make('weather')
  .add(
    HttpApiEndpoint.get('getWeather')`/`
      .addSuccess(WeatherForecast)
      .addError(WeatherNotAvailableError, { status: 404 })
      .addError(WeatherFetchError, { status: 502 })
  )
  .add(
    HttpApiEndpoint.get('getCareAdjustments')`/adjustments`
      .addSuccess(Schema.Array(CareAdjustment))
      .addError(WeatherNotAvailableError, { status: 404 })
      .addError(WeatherFetchError, { status: 502 })
  )
  .prefix('/weather')
  .middleware(Authentication)
