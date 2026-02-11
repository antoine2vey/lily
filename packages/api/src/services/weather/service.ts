import {
  disableWeatherForUser,
  enableWeatherForUser,
} from '@lily/api/services/weather/endpoints/enable-weather'
import { getCareAdjustments } from '@lily/api/services/weather/endpoints/get-care-adjustments'
import { getWeatherForUser } from '@lily/api/services/weather/endpoints/get-weather'
import { Effect } from 'effect'

export class WeatherService extends Effect.Service<WeatherService>()(
  'WeatherService',
  {
    effect: Effect.succeed({
      getWeatherForUser,
      getCareAdjustments,
      enableWeatherForUser,
      disableWeatherForUser,
    }),
  }
) {}
