import type { IWeatherProvider } from '@lily/api/services/weather/provider'
import { createFallbackProvider } from '@lily/api/services/weather/providers/fallback.provider'
import { createOpenMeteoProvider } from '@lily/api/services/weather/providers/open-meteo.provider'
import { createOpenWeatherMapProvider } from '@lily/api/services/weather/providers/openweathermap.provider'
import { WeatherFetchError, type WeatherForecast } from '@lily/shared'
import { Duration, Effect, Exit, Fiber, Option } from 'effect'
import { TestClock } from 'effect/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const signals: AbortSignal[] = []

beforeEach(() => {
  signals.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: RequestInit) => {
      if (init?.signal) signals.push(init.signal)
      return new Promise<never>(() => {})
    })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const DEADLINE = Duration.seconds(10)

const runPastDeadline = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.gen(function* () {
    const fiber = yield* Effect.forkChild(effect)
    yield* TestClock.adjust(Duration.subtract(DEADLINE, Duration.seconds(1)))
    expect(fiber.pollUnsafe()).toBeUndefined()
    expect(signals[0]?.aborted).toBe(false)
    yield* TestClock.adjust(Duration.seconds(1))
    return yield* Fiber.await(fiber)
  }).pipe(Effect.provide(TestClock.layer()), Effect.runPromise)

describe('weather providers against an API that never responds', () => {
  it.each([
    { name: 'OpenMeteo', provider: createOpenMeteoProvider() },
    { name: 'OpenWeatherMap', provider: createOpenWeatherMapProvider('key') },
  ])(
    '$name fails with WeatherFetchError and aborts the request',
    async ({ provider }) => {
      const exit = await runPastDeadline(provider.fetchForecast(48.8, 2.3))

      const error = Exit.findErrorOption(exit).pipe(Option.getOrUndefined)
      expect(error).toBeInstanceOf(WeatherFetchError)
      expect(signals).toHaveLength(1)
      expect(signals[0]?.aborted).toBe(true)
    }
  )

  it('falls back to the next provider when the first one hangs', async () => {
    const forecast: WeatherForecast = {
      latitude: 48.8,
      longitude: 2.3,
      daily: [],
    }
    const backup: IWeatherProvider = {
      name: 'Backup',
      fetchForecast: () => Effect.succeed(forecast),
    }
    const provider = createFallbackProvider([createOpenMeteoProvider(), backup])

    const exit = await runPastDeadline(provider.fetchForecast(48.8, 2.3))

    expect(exit).toEqual(Exit.succeed(forecast))
    expect(signals[0]?.aborted).toBe(true)
  })
})
