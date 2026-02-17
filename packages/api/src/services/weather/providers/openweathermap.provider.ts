import type { IWeatherProvider } from '@lily/api/services/weather/provider'
import type { WeatherData, WeatherForecast } from '@lily/shared'
import { roundCoord, toIsoString, WeatherFetchError } from '@lily/shared'
import { Array, DateTime, Effect, Option, pipe, String as Str } from 'effect'

// OpenWeatherMap One Call 3.0 response shape (subset we use)
interface OWMDailyEntry {
  readonly dt: number
  readonly temp: {
    readonly min: number
    readonly max: number
    readonly day: number
  }
  readonly humidity: number
  readonly wind_speed: number
  readonly rain?: number
  readonly clouds: number
  readonly uvi: number
}

interface OWMResponse {
  readonly lat: number
  readonly lon: number
  readonly daily: readonly OWMDailyEntry[]
}

/**
 * Estimate extraterrestrial radiation (Ra) in MJ/m²/day using latitude and day of year.
 * Simplified from FAO-56 equations 21-27.
 * This is a coarse approximation sufficient for the Hargreaves fallback.
 */
const estimateExtraterrestrialRadiation = (
  latDeg: number,
  dayOfYear: number
): number => {
  const latRad = (latDeg * Math.PI) / 180
  // Solar declination (FAO-56 eq. 24)
  const decl = 0.409 * Math.sin((2 * Math.PI * dayOfYear) / 365 - 1.39)
  // Sunset hour angle (FAO-56 eq. 25)
  const ws = Math.acos(-Math.tan(latRad) * Math.tan(decl))
  // Inverse relative distance Earth-Sun (FAO-56 eq. 23)
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * dayOfYear) / 365)
  // Solar constant * conversion: 24*60/π * 0.0820 = 37.586
  const Gsc = 37.586
  const Ra =
    Gsc *
    dr *
    (ws * Math.sin(latRad) * Math.sin(decl) +
      Math.cos(latRad) * Math.cos(decl) * Math.sin(ws))
  return Math.max(0, Ra)
}

/**
 * Estimate ET0 using the Hargreaves-Samani equation (1985).
 * ET0 = 0.0023 × (Tmean + 17.8) × √(Tmax - Tmin) × Ra
 *
 * This is less accurate than the full Penman-Monteith used by Open-Meteo,
 * but provides a reasonable fallback when Open-Meteo is unavailable.
 * Source: Hargreaves, G.H. and Samani, Z.A. (1985)
 */
const estimateET0Hargreaves = (
  tMin: number,
  tMax: number,
  tMean: number,
  latDeg: number,
  dayOfYear: number
): number => {
  const tempRange = Math.max(0, tMax - tMin)
  const Ra = estimateExtraterrestrialRadiation(latDeg, dayOfYear)
  return 0.0023 * (tMean + 17.8) * Math.sqrt(tempRange) * Ra
}

const getDayOfYear = (timestamp: number): number =>
  Option.match(DateTime.make(timestamp * 1000), {
    onNone: () => 1,
    onSome: (dt) => {
      const parts = DateTime.toParts(dt)
      const startOfYear = DateTime.unsafeMake({
        year: parts.year,
        month: 1,
        day: 1,
      })
      const distanceMs = DateTime.distance(startOfYear, dt)
      return Math.floor(distanceMs / (1000 * 60 * 60 * 24)) + 1
    },
  })

const formatDate = (timestamp: number): string =>
  Option.match(DateTime.make(timestamp * 1000), {
    onNone: () => '1970-01-01',
    onSome: (dt) => pipe(toIsoString(dt), Str.split('T'), Array.headNonEmpty),
  })

const normalizeResponse = (res: OWMResponse): WeatherForecast => {
  const daily: ReadonlyArray<WeatherData> = pipe(
    res.daily as unknown as Array<OWMDailyEntry>,
    Array.map((entry) => {
      const dayOfYear = getDayOfYear(entry.dt)
      const et0 = estimateET0Hargreaves(
        entry.temp.min,
        entry.temp.max,
        entry.temp.day,
        res.lat,
        dayOfYear
      )

      return {
        date: formatDate(entry.dt),
        temperatureMin: entry.temp.min,
        temperatureMax: entry.temp.max,
        temperatureMean: entry.temp.day,
        humidity: entry.humidity,
        windSpeed: entry.wind_speed,
        precipitation: entry.rain ?? 0,
        solarRadiation: null, // Not available from OWM
        et0,
        cloudCover: entry.clouds,
        soilTemperature: null, // Not available from OWM
      }
    })
  )

  return {
    latitude: roundCoord(res.lat),
    longitude: roundCoord(res.lon),
    daily: daily as Array<WeatherData>,
  }
}

export const createOpenWeatherMapProvider = (
  apiKey: string
): IWeatherProvider => ({
  name: 'OpenWeatherMap',

  fetchForecast: (lat, lng, _forecastDays = 7) => {
    if (!apiKey) {
      return Effect.fail(
        new WeatherFetchError({
          message: 'OpenWeatherMap API key not configured',
        })
      )
    }

    const rlat = roundCoord(lat)
    const rlng = roundCoord(lng)
    const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${rlat}&lon=${rlng}&exclude=minutely,hourly,alerts&units=metric&appid=${apiKey}`

    return Effect.tryPromise({
      try: async () => {
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(
            `OpenWeatherMap API returned ${response.status}: ${response.statusText}`
          )
        }
        return (await response.json()) as OWMResponse
      },
      catch: (error) =>
        new WeatherFetchError({
          message: `OpenWeatherMap fetch failed: ${error instanceof Error ? error.message : String(error)}`,
        }),
    }).pipe(Effect.map(normalizeResponse))
  },
})
