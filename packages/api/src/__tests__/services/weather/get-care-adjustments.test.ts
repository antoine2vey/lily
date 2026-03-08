import { createTestSchedule } from '@lily/api/__tests__/fixtures/care-schedules'
import { mockUser1 } from '@lily/api/__tests__/fixtures/users'
import { mockForecast } from '@lily/api/__tests__/fixtures/weather'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { getCareAdjustments } from '@lily/api/services/weather/endpoints/get-care-adjustments'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

// Create a minimal plant fixture for this test
const mockPlant = {
  id: 'plant-1',
  name: 'Test Plant',
  category: 'Foliage',
  wateringRating: 3,
  userId: 'user-1',
  description: null,
  imageUrl: null,
  humidityRating: 3,
  lightingRating: 3,
  petToxicityRating: 1,
  health: 'HEALTHY' as const,
  dateAdded: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  remindersEnabled: true,
  isFavorite: false,
  roomId: null,
}

const mockCareSchedules = [
  createTestSchedule({
    plantId: 'plant-1',
    careType: 'watering',
    frequencyDays: 7,
  }),
]

describe('getCareAdjustments', () => {
  it('should fail when user has no weather enabled', async () => {
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
      createMockPlantRepository({ plants: [mockPlant] }),
      createMockWeatherCache(),
      createMockWeatherProvider(mockForecast),
      createMockWeatherRepository(),
      createMockCareScheduleRepository({
        schedules: mockCareSchedules,
      })
    )

    const result = await Effect.runPromiseExit(
      getCareAdjustments().pipe(Effect.provide(layers))
    )

    expect(Exit.isFailure(result)).toBe(true)
  })

  it('should return adjustments for each plant when weather is enabled', async () => {
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
      createMockPlantRepository({ plants: [mockPlant] }),
      createMockWeatherCache(mockForecast),
      createMockWeatherProvider(mockForecast),
      createMockWeatherRepository(),
      createMockCareScheduleRepository({
        schedules: mockCareSchedules,
      })
    )

    const result = await Effect.runPromise(
      getCareAdjustments().pipe(Effect.provide(layers))
    )

    expect(result.length).toBe(1)
    expect(result[0]?.plantId).toBe('plant-1')
    expect(result[0]?.adjustedWateringDays).toBeGreaterThanOrEqual(1)
    expect(result[0]?.factors).toBeDefined()
    expect(result[0]?.factors.temperature).toBeDefined()
    expect(result[0]?.factors.humidity).toBeDefined()
    expect(result[0]?.factors.wind).toBeDefined()
  })

  it('should return empty array when user has no plants', async () => {
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
      createMockPlantRepository({ plants: [] }), // No plants
      createMockWeatherCache(mockForecast),
      createMockWeatherProvider(mockForecast),
      createMockWeatherRepository(),
      createMockCareScheduleRepository({})
    )

    const result = await Effect.runPromise(
      getCareAdjustments().pipe(Effect.provide(layers))
    )

    expect(result.length).toBe(0)
  })
})
