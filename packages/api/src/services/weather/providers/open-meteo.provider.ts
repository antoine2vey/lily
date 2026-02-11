import type { IWeatherProvider } from '@lily/api/services/weather/provider'
import type { WeatherData, WeatherForecast } from '@lily/shared'
import { roundCoord, WeatherFetchError } from '@lily/shared'
import { Array, Effect, pipe } from 'effect'

// Open-Meteo API response shape (subset we use)
interface OpenMeteoResponse {
  readonly latitude: number
  readonly longitude: number
  readonly daily: {
    readonly time: readonly string[]
    readonly temperature_2m_max: readonly (number | null)[]
    readonly temperature_2m_min: readonly (number | null)[]
    readonly temperature_2m_mean: readonly (number | null)[]
    readonly relative_humidity_2m_mean: readonly (number | null)[]
    readonly wind_speed_10m_max: readonly (number | null)[]
    readonly precipitation_sum: readonly (number | null)[]
    readonly shortwave_radiation_sum: readonly (number | null)[]
    readonly et0_fao_evapotranspiration: readonly (number | null)[]
    readonly cloud_cover_mean: readonly (number | null)[]
    readonly soil_temperature_0_to_7cm_mean: readonly (number | null)[]
  }
}

const DAILY_VARS = [
  'temperature_2m_max',
  'temperature_2m_min',
  'temperature_2m_mean',
  'relative_humidity_2m_mean',
  'wind_speed_10m_max',
  'precipitation_sum',
  'shortwave_radiation_sum',
  'et0_fao_evapotranspiration',
  'cloud_cover_mean',
  'soil_temperature_0_to_7cm_mean',
].join(',')

const normalizeResponse = (res: OpenMeteoResponse): WeatherForecast => {
  const daily: ReadonlyArray<WeatherData> = pipe(
    res.daily.time,
    Array.map((date, i) => ({
      date,
      temperatureMin: res.daily.temperature_2m_min[i] ?? null,
      temperatureMax: res.daily.temperature_2m_max[i] ?? null,
      temperatureMean: res.daily.temperature_2m_mean[i] ?? null,
      humidity: res.daily.relative_humidity_2m_mean[i] ?? null,
      windSpeed: res.daily.wind_speed_10m_max[i] ?? null,
      precipitation: res.daily.precipitation_sum[i] ?? null,
      solarRadiation: res.daily.shortwave_radiation_sum[i] ?? null,
      et0: res.daily.et0_fao_evapotranspiration[i] ?? null,
      cloudCover: res.daily.cloud_cover_mean[i] ?? null,
      soilTemperature: res.daily.soil_temperature_0_to_7cm_mean[i] ?? null,
    }))
  )

  return {
    latitude: roundCoord(res.latitude),
    longitude: roundCoord(res.longitude),
    daily: daily as Array<WeatherData>,
  }
}

export const createOpenMeteoProvider = (): IWeatherProvider => ({
  name: 'OpenMeteo',

  fetchForecast: (lat, lng, forecastDays = 7) => {
    const rlat = roundCoord(lat)
    const rlng = roundCoord(lng)
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${rlat}&longitude=${rlng}&daily=${DAILY_VARS}&forecast_days=${forecastDays}&timezone=UTC`

    return Effect.tryPromise({
      try: async () => {
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(
            `Open-Meteo API returned ${response.status}: ${response.statusText}`
          )
        }
        return (await response.json()) as OpenMeteoResponse
      },
      catch: (error) =>
        new WeatherFetchError({
          message: `Open-Meteo fetch failed: ${error instanceof Error ? error.message : String(error)}`,
        }),
    }).pipe(Effect.map(normalizeResponse))
  },
})
