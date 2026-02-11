import { mockUser1 } from '@lily/api/__tests__/fixtures/users'
import { mockForecast } from '@lily/api/__tests__/fixtures/weather'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import {
  getWeatherForLocation,
  getWeatherForUser,
} from '@lily/api/services/weather/endpoints/get-weather'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('getWeatherForLocation', () => {
  it('should return cached forecast when available', async () => {
    const layers = Layer.mergeAll(
      createMockWeatherCache(mockForecast),
      createMockWeatherProvider(mockForecast),
      createMockWeatherRepository()
    )

    const result = await Effect.runPromise(
      getWeatherForLocation(48.86, 2.35).pipe(Effect.provide(layers))
    )

    expect(result.latitude).toBe(48.86)
    expect(result.longitude).toBe(2.35)
    expect(result.daily.length).toBe(7)
  })

  it('should fetch from provider when cache misses', async () => {
    const layers = Layer.mergeAll(
      createMockWeatherCache(), // No cached data
      createMockWeatherProvider(mockForecast),
      createMockWeatherRepository()
    )

    const result = await Effect.runPromise(
      getWeatherForLocation(48.86, 2.35).pipe(Effect.provide(layers))
    )

    expect(result.daily.length).toBe(7)
  })

  it('should fail when provider fails and no cache', async () => {
    const layers = Layer.mergeAll(
      createMockWeatherCache(), // No cached data
      createMockWeatherProvider(), // No forecast → fails
      createMockWeatherRepository()
    )

    const result = await Effect.runPromiseExit(
      getWeatherForLocation(48.86, 2.35).pipe(Effect.provide(layers))
    )

    expect(Exit.isFailure(result)).toBe(true)
  })
})

describe('getWeatherForUser', () => {
  it('should fail with WeatherNotAvailableError when user has no location', async () => {
    const layers = Layer.mergeAll(
      Layer.succeed(CurrentUser, {
        id: mockUser1.id,
        email: mockUser1.email,
        name: mockUser1.name,
        createdAt: mockUser1.createdAt,
        updatedAt: mockUser1.updatedAt,
        role: mockUser1.role,
        status: mockUser1.status,
      }),
      createMockUserRepository([mockUser1]), // weatherEnabled = false
      createMockWeatherCache(),
      createMockWeatherProvider(mockForecast),
      createMockWeatherRepository()
    )

    const result = await Effect.runPromiseExit(
      getWeatherForUser().pipe(Effect.provide(layers))
    )

    expect(Exit.isFailure(result)).toBe(true)
  })

  it('should return forecast when user has weather enabled', async () => {
    const weatherUser = {
      ...mockUser1,
      weatherEnabled: true,
      latitude: 48.86,
      longitude: 2.35,
    }

    const layers = Layer.mergeAll(
      Layer.succeed(CurrentUser, {
        id: weatherUser.id,
        email: weatherUser.email,
        name: weatherUser.name,
        createdAt: weatherUser.createdAt,
        updatedAt: weatherUser.updatedAt,
        role: weatherUser.role,
        status: weatherUser.status,
      }),
      createMockUserRepository([weatherUser]),
      createMockWeatherCache(mockForecast),
      createMockWeatherProvider(mockForecast),
      createMockWeatherRepository()
    )

    const result = await Effect.runPromise(
      getWeatherForUser().pipe(Effect.provide(layers))
    )

    expect(result.daily.length).toBe(7)
  })
})
