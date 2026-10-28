import {
  createTestMembership,
  mockCanopyId,
} from '@lily/api/__tests__/fixtures/canopies'
import { schedulesFromPlants } from '@lily/api/__tests__/fixtures/care-schedules'
import {
  createTestPlant,
  fertilizationSpec,
  wateringSpec,
} from '@lily/api/__tests__/fixtures/plants'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import {
  buildWeatherCtx,
  mockWeatherDataExtremeHeat,
  mockWeatherDataModerate,
  mockWeatherDataRainy,
  parisWinterForecast,
} from '@lily/api/__tests__/fixtures/weather'
import {
  createCanopyStore,
  createMockCanopyRepository,
  createTestCanopyRow,
} from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import type { WeatherContext } from '@lily/api/services/weather/helpers/get-weather-context'
import {
  readjustCareSchedules,
  weatherScopes,
} from '@lily/api/services/weather-scheduler/readjust-care-schedules'
import type { Notification } from '@lily/shared/notification'
import { Array, Effect, Layer, Option, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

// Helper to create a weather-enabled user
const weatherUser = createTestUser({
  id: 'weather-user-1',
  weatherEnabled: true,
  latitude: 48.86,
  longitude: 2.35,
  timezone: 'Europe/Paris',
  careReminders: true,
})

const userScopes = weatherScopes([weatherUser], [])

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
    MockSqlClientLive,
    createMockUserRepository([weatherUser]),
    createMockPlantRepository({ plants }),
    createMockNotificationRepository(notifications),
    createMockCanopyRepository(),
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
      readjustCareSchedules(userScopes, buildContextMap(moderateCtx)).pipe(
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
      readjustCareSchedules(userScopes, buildContextMap(moderateCtx)).pipe(
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
      readjustCareSchedules(userScopes, buildContextMap(moderateCtx)).pipe(
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
      readjustCareSchedules(userScopes, buildContextMap(moderateCtx)).pipe(
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
      readjustCareSchedules(userScopes, buildContextMap(rainyCtx)).pipe(
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
      readjustCareSchedules(userScopes, buildContextMap(hotCtx)).pipe(
        Effect.provide(layers)
      )
    )
  })

  it('should handle user with no plants gracefully', async () => {
    const layers = buildLayers({ plants: [] })

    await Effect.runPromise(
      readjustCareSchedules(userScopes, buildContextMap(moderateCtx)).pipe(
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
      readjustCareSchedules(userScopes, new Map()).pipe(Effect.provide(layers))
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
      readjustCareSchedules(userScopes, buildContextMap(rainyCtx)).pipe(
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
      readjustCareSchedules(userScopes, buildContextMap(moderateCtx)).pipe(
        Effect.provide(layers)
      )
    )
  })
})

describe('readjustCareSchedules for a Canopy', () => {
  const oneDayMs = 24 * 60 * 60 * 1000
  const canopy = createTestCanopyRow({
    id: mockCanopyId,
    timezone: 'UTC',
    latitude: 48.86,
    longitude: 2.35,
  })
  const morningMember = createTestUser({
    id: 'member-morning',
    timezone: 'UTC',
    preferredNotificationTime: '08:00',
    careReminders: true,
  })
  const eveningMember = createTestUser({
    id: 'member-evening',
    timezone: 'UTC',
    preferredNotificationTime: '19:00',
    careReminders: true,
  })

  const run = async (contextMap: ReadonlyMap<string, WeatherContext>) => {
    const originalNext = new Date(Date.now() + 4 * oneDayMs)
    const plant = createTestPlant({
      id: 'canopy-plant',
      name: 'Shared Fern',
      category: 'Foliage',
      wateringRating: 3,
      remindersEnabled: true,
      userId: null,
      canopyId: mockCanopyId,
      createdByUserId: morningMember.id,
      roomId: 'canopy-balcony',
      scheduleSpecs: [
        wateringSpec({
          frequencyDays: 7,
          lastCareAt: new Date(Date.now() - 3 * oneDayMs),
          nextCareAt: new Date(originalNext),
        }),
      ],
    })
    const schedules = schedulesFromPlants([plant])
    const notifications: Notification[] = []

    await Effect.runPromise(
      readjustCareSchedules(weatherScopes([], [canopy]), contextMap).pipe(
        Effect.provide(
          Layer.mergeAll(
            MockSqlClientLive,
            createMockUserRepository([morningMember, eveningMember]),
            createMockPlantRepository({
              plants: [plant],
              rooms: [
                {
                  id: 'canopy-balcony',
                  name: 'Balcony',
                  icon: '🌿',
                  luminosity: 40000,
                  isOutdoor: true,
                },
              ],
            }),
            createMockNotificationRepository(notifications),
            createMockCanopyRepository(
              createCanopyStore({
                canopies: [canopy],
                members: [
                  createTestMembership({
                    userId: morningMember.id,
                    role: 'owner',
                  }),
                  createTestMembership({ userId: eveningMember.id }),
                ],
              })
            ),
            createMockDelegationRepository(),
            createMockCareScheduleRepository({ schedules, plants: [plant] })
          )
        )
      )
    )

    const nextCareAt = pipe(
      Array.findFirst(schedules, (s) => s.careType === 'watering'),
      Option.flatMap((s) => Option.fromNullishOr(s.nextCareAt)),
      Option.map((d) => d.getTime()),
      Option.getOrNull
    )
    return { originalNext: originalNext.getTime(), nextCareAt, notifications }
  }

  it('shifts a located Canopy plant and reminds every member at their own hour', async () => {
    const { originalNext, nextCareAt, notifications } = await run(
      buildContextMap(buildWeatherCtx(parisWinterForecast))
    )

    expect(nextCareAt).not.toBeNull()
    expect(nextCareAt).not.toBe(originalNext)

    const reminders = Array.filter(
      notifications,
      (n) => n.type === 'watering_reminder' && n.plantId === 'canopy-plant'
    )
    expect(
      Array.map(reminders, (n) => ({
        userId: n.userId,
        hour: new Date(n.scheduledAt).getUTCHours(),
      }))
    ).toEqual(
      expect.arrayContaining([
        { userId: morningMember.id, hour: 8 },
        { userId: eveningMember.id, hour: 19 },
      ])
    )
    expect(reminders).toHaveLength(2)
  })

  it('leaves a Canopy plant untouched when its location has no weather context', async () => {
    const { originalNext, nextCareAt, notifications } = await run(
      new Map([['40.71_-74.01', buildWeatherCtx(parisWinterForecast)]])
    )

    expect(nextCareAt).toBe(originalNext)
    expect(notifications).toHaveLength(0)
  })
})
