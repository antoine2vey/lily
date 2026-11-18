import { createOpenWeatherMapProvider } from '@lily/api/services/weather/providers/openweathermap.provider'
import { WeatherForecast } from '@lily/shared'
import { DateTime, Effect, Schema } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'

const TROMSO = { lat: 69.65, lon: 18.96 }

const owmDay = (iso: string) => ({
  dt: DateTime.toEpochMillis(DateTime.makeUnsafe(iso)) / 1000,
  temp: { min: -6, max: -2, day: -4 },
  humidity: 80,
  wind_speed: 4,
  clouds: 90,
  uvi: 0,
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OpenWeatherMap forecast above the Arctic Circle', () => {
  it('encodes as the getWeather response at both solstices', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          ...TROMSO,
          daily: [
            owmDay('2026-12-21T11:00:00Z'),
            owmDay('2026-06-21T11:00:00Z'),
          ],
        })
      )
    )

    const forecast = await Effect.runPromise(
      createOpenWeatherMapProvider('key').fetchForecast(TROMSO.lat, TROMSO.lon)
    )
    const [polarNight, midnightSun] =
      Schema.encodeSync(WeatherForecast)(forecast).daily

    expect(polarNight?.et0).toBe(0)
    expect(midnightSun?.et0).toBeGreaterThan(0)
  })
})
