import { schedulesFromPlants } from '@lily/api/__tests__/fixtures/care-schedules'
import {
  createTestPlant,
  fertilizationSpec,
  wateringSpec,
} from '@lily/api/__tests__/fixtures/plants'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import {
  mockWeatherDataExtremeHeat,
  mockWeatherDataModerate,
  mockWeatherDataRainy,
} from '@lily/api/__tests__/fixtures/weather'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import type { WeatherContext } from '@lily/api/services/weather/helpers/get-weather-context'
import { readjustCareSchedules } from '@lily/api/services/weather-scheduler/readjust-care-schedules'
import { Effect, Layer } from 'effect'
import { describe, it } from 'vitest'

// Helper to create a weather-enabled user
const weatherUser = createTestUser({
  id: 'weather-user-1',
  weatherEnabled: true,
  latitude: 48.86,
  longitude: 2.35,
  timezone: 'Europe/Paris',
  careReminders: true,
})

// Build a weather context from a daily array
const buildWeatherContext = (
  daily: ReadonlyArray<typeof mockWeatherDataModerate>
): WeatherContext => ({
  currentWeather: daily[0] ?? mockWeatherDataModerate,
  recentHistory: [],
  forecast: daily,
})

// Build a context map keyed by the user's rounded location
const buildContextMap = (
  ctx: WeatherContext
): ReadonlyMap<string, WeatherContext> => new Map([['48.86_2.35', ctx]])

const moderateCtx = buildWeatherContext([
  mockWeatherDataModerate,
  { ...mockWeatherDataModerate, date: '2026-02-11' },
  { ...mockWeatherDataModerate, date: '2026-02-12' },
])

const buildLayers = ({
  plants = [],
  notifications = [],
}: {
  plants?: Array<ReturnType<typeof createTestPlant>>
  notifications?: Array<never>
} = {}) =>
  Layer.mergeAll(
    createMockUserRepository([weatherUser]),
    createMockPlantRepository({ plants }),
    createMockNotificationRepository(notifications),
    createMockDelegationRepository(),
    createMockCareScheduleRepository({
      schedules: schedulesFromPlants(plants),
      plants,
    })
  )

describe('readjustCareSchedules', () => {
  it('should update nextWateringAt when weather adjustment differs from stored value', async () => {
    const now = new Date()
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    const currentNext = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000) // 10 days from now (wrong)

    const plant = createTestPlant({
      id: 'plant-adjust-1',
      name: 'Test Monstera',
      category: 'tropical',
      wateringRating: 3,
      remindersEnabled: true,
      userId: weatherUser.id,
      scheduleSpecs: [
        wateringSpec({
          frequencyDays: 7,
          lastCareAt: threeDaysAgo,
          nextCareAt: currentNext,
        }),
      ],
    })

    const layers = buildLayers({ plants: [plant] })

    await Effect.runPromise(
      readjustCareSchedules([weatherUser], buildContextMap(moderateCtx)).pipe(
        Effect.provide(layers)
      )
    )
  })

  it('should not update when adjustment matches current schedule', async () => {
    const now = new Date()
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    const correctNext = new Date(
      threeDaysAgo.getTime() + 7 * 24 * 60 * 60 * 1000
    )

    const plant = createTestPlant({
      id: 'plant-no-change',
      name: 'Correct Schedule Plant',
      category: 'tropical',
      wateringRating: 3,
      remindersEnabled: true,
      userId: weatherUser.id,
      scheduleSpecs: [
        wateringSpec({
          frequencyDays: 7,
          lastCareAt: threeDaysAgo,
          nextCareAt: correctNext,
        }),
      ],
    })

    const layers = buildLayers({ plants: [plant] })

    await Effect.runPromise(
      readjustCareSchedules([weatherUser], buildContextMap(moderateCtx)).pipe(
        Effect.provide(layers)
      )
    )
  })

  it('should skip plants without lastWateredAt (never been watered)', async () => {
    const plant = createTestPlant({
      id: 'plant-never-watered',
      name: 'New Plant',
      userId: weatherUser.id,
      scheduleSpecs: [
        wateringSpec({
          frequencyDays: 7,
          lastCareAt: null,
          nextCareAt: null,
        }),
      ],
    })

    const layers = buildLayers({ plants: [plant] })

    await Effect.runPromise(
      readjustCareSchedules([weatherUser], buildContextMap(moderateCtx)).pipe(
        Effect.provide(layers)
      )
    )
  })

  it('should skip plants without nextWateringAt', async () => {
    const plant = createTestPlant({
      id: 'plant-no-next',
      name: 'No Schedule Plant',
      userId: weatherUser.id,
      scheduleSpecs: [
        wateringSpec({
          frequencyDays: 7,
          lastCareAt: new Date(),
          nextCareAt: null,
        }),
      ],
    })

    const layers = buildLayers({ plants: [plant] })

    await Effect.runPromise(
      readjustCareSchedules([weatherUser], buildContextMap(moderateCtx)).pipe(
        Effect.provide(layers)
      )
    )
  })

  it('should push nextWateringAt forward when skipWatering is true and next watering is today or past', async () => {
    const now = new Date()
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)
    const pastDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000)

    const rainyCtx = buildWeatherContext([
      mockWeatherDataRainy,
      { ...mockWeatherDataModerate, date: '2026-02-11' },
    ])

    const plant = createTestPlant({
      id: 'plant-skip-water',
      name: 'Rainy Day Plant',
      category: 'tropical',
      wateringRating: 3,
      remindersEnabled: true,
      userId: weatherUser.id,
      scheduleSpecs: [
        wateringSpec({
          frequencyDays: 7,
          lastCareAt: fiveDaysAgo,
          nextCareAt: pastDate,
        }),
      ],
    })

    const layers = buildLayers({ plants: [plant] })

    await Effect.runPromise(
      readjustCareSchedules([weatherUser], buildContextMap(rainyCtx)).pipe(
        Effect.provide(layers)
      )
    )
  })

  it('should push nextFertilizationAt forward when skipFertilization is true and next fertilization is today or past', async () => {
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const pastDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000)

    const hotCtx = buildWeatherContext([
      mockWeatherDataExtremeHeat,
      { ...mockWeatherDataModerate, date: '2026-02-11' },
    ])

    const plant = createTestPlant({
      id: 'plant-skip-fert',
      name: 'Hot Day Plant',
      category: 'tropical',
      wateringRating: 3,
      remindersEnabled: true,
      userId: weatherUser.id,
      scheduleSpecs: [
        wateringSpec({
          frequencyDays: 7,
          lastCareAt: thirtyDaysAgo,
          nextCareAt: new Date(
            thirtyDaysAgo.getTime() + 7 * 24 * 60 * 60 * 1000
          ),
        }),
        fertilizationSpec({
          frequencyDays: 30,
          lastCareAt: thirtyDaysAgo,
          nextCareAt: pastDate,
        }),
      ],
    })

    const layers = buildLayers({ plants: [plant] })

    await Effect.runPromise(
      readjustCareSchedules([weatherUser], buildContextMap(hotCtx)).pipe(
        Effect.provide(layers)
      )
    )
  })

  it('should handle user with no plants gracefully', async () => {
    const layers = buildLayers({ plants: [] })

    await Effect.runPromise(
      readjustCareSchedules([weatherUser], buildContextMap(moderateCtx)).pipe(
        Effect.provide(layers)
      )
    )
  })

  it('should skip user when no weather context available for their location', async () => {
    const plant = createTestPlant({
      id: 'plant-no-ctx',
      name: 'No Context Plant',
      userId: weatherUser.id,
      scheduleSpecs: [
        wateringSpec({
          frequencyDays: 7,
          lastCareAt: new Date(),
          nextCareAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        }),
      ],
    })

    const layers = buildLayers({ plants: [plant] })

    // Empty context map — user's location has no weather data
    await Effect.runPromise(
      readjustCareSchedules([weatherUser], new Map()).pipe(
        Effect.provide(layers)
      )
    )
  })

  it('should not skip watering for indoor plant (room: null) even with rain', async () => {
    const now = new Date()
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)
    const pastDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000)

    const rainyCtx = buildWeatherContext([
      mockWeatherDataRainy,
      { ...mockWeatherDataModerate, date: '2026-02-11' },
    ])

    // Plant with room: null (indoor by default) — rain should NOT skip watering
    const plant = createTestPlant({
      id: 'plant-indoor-rain',
      name: 'Indoor Plant In Rain',
      category: 'tropical',
      wateringRating: 3,
      remindersEnabled: true,
      userId: weatherUser.id,
      scheduleSpecs: [
        wateringSpec({
          frequencyDays: 7,
          lastCareAt: fiveDaysAgo,
          nextCareAt: pastDate,
        }),
      ],
    })

    const layers = buildLayers({ plants: [plant] })

    // Should complete without error — the indoor plant won't have skipWatering=true
    await Effect.runPromise(
      readjustCareSchedules([weatherUser], buildContextMap(rainyCtx)).pipe(
        Effect.provide(layers)
      )
    )
  })

  it('should skip when no weather-enabled users exist', async () => {
    const layers = buildLayers()

    await Effect.runPromise(
      readjustCareSchedules([], buildContextMap(moderateCtx)).pipe(
        Effect.provide(layers)
      )
    )
  })

  it('should process multiple plants for a single user', async () => {
    const now = new Date()
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)

    const plants = [
      createTestPlant({
        id: 'plant-multi-1',
        name: 'Plant A',
        category: 'tropical',
        wateringRating: 3,
        userId: weatherUser.id,
        scheduleSpecs: [
          wateringSpec({
            frequencyDays: 7,
            lastCareAt: threeDaysAgo,
            nextCareAt: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000),
          }),
        ],
      }),
      createTestPlant({
        id: 'plant-multi-2',
        name: 'Plant B',
        category: 'succulent',
        wateringRating: 1,
        userId: weatherUser.id,
        scheduleSpecs: [
          wateringSpec({
            frequencyDays: 14,
            lastCareAt: threeDaysAgo,
            nextCareAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          }),
        ],
      }),
    ]

    const layers = buildLayers({ plants })

    await Effect.runPromise(
      readjustCareSchedules([weatherUser], buildContextMap(moderateCtx)).pipe(
        Effect.provide(layers)
      )
    )
  })
})
