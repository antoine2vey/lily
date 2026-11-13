import { mockCanopyId } from '@lily/api/__tests__/fixtures/canopies'
import { schedulesFromPlants } from '@lily/api/__tests__/fixtures/care-schedules'
import {
  createTestPlant,
  wateringSpec,
} from '@lily/api/__tests__/fixtures/plants'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import {
  buildWeatherCtx,
  mockWeatherDataModerate,
  parisWinterForecast,
} from '@lily/api/__tests__/fixtures/weather'
import {
  createMockCanopyRepository,
  createTestCanopyRow,
} from '@lily/api/__tests__/mocks/canopy.repository'
import { createStubCare } from '@lily/api/__tests__/mocks/care'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { DueMove } from '@lily/api/contexts/care'
import type { WeatherContext } from '@lily/api/services/weather/helpers/get-weather-context'
import {
  readjustCareSchedules,
  type WeatherScope,
  weatherScopes,
} from '@lily/api/services/weather-scheduler/readjust-care-schedules'
import { Array, Effect, Layer, Order } from 'effect'
import { describe, expect, it } from 'vitest'

const oneDayMs = 24 * 60 * 60 * 1000

const weatherUser = createTestUser({
  id: 'weather-user-1',
  weatherEnabled: true,
  latitude: 48.86,
  longitude: 2.35,
  timezone: 'Europe/Paris',
  careReminders: true,
})

const userScopes = weatherScopes([weatherUser], [])

const buildWeatherContext = (
  daily: ReadonlyArray<typeof mockWeatherDataModerate>
): WeatherContext => ({
  currentWeather: daily[0] ?? mockWeatherDataModerate,
  recentHistory: [],
  forecast: daily,
})

const buildContextMap = (
  ctx: WeatherContext
): ReadonlyMap<string, WeatherContext> => new Map([['48.86_2.35', ctx]])

const moderateCtx = buildWeatherContext([
  mockWeatherDataModerate,
  { ...mockWeatherDataModerate, date: '2026-02-11' },
  { ...mockWeatherDataModerate, date: '2026-02-12' },
])

const readjust = async (
  scopes: ReadonlyArray<WeatherScope>,
  contextMap: ReadonlyMap<string, WeatherContext>,
  plants: Array<ReturnType<typeof createTestPlant>> = [],
  rooms: Parameters<typeof createMockPlantRepository>[0]['rooms'] = []
) => {
  const care = createStubCare()
  await Effect.runPromise(
    readjustCareSchedules(scopes, contextMap).pipe(
      Effect.provide(
        Layer.mergeAll(
          MockSqlClientLive,
          care.layer,
          createMockUserRepository([weatherUser]),
          createMockPlantRepository({ plants, rooms }),
          createMockNotificationRepository([]),
          createMockCanopyRepository(),
          createMockDelegationRepository(),
          createMockCareScheduleRepository({
            schedules: schedulesFromPlants(plants),
            plants,
          })
        )
      )
    )
  )
  return {
    commands: care.moved,
    moves: Array.flatMap(care.moved, (command) => command.moves),
  }
}

describe('readjustCareSchedules', () => {
  it('asks Care to move watering by the days between the stored due day and the weather-adjusted one', async () => {
    const now = Date.now()
    const plant = createTestPlant({
      id: 'plant-adjust-1',
      name: 'Test Monstera',
      category: 'tropical',
      wateringRating: 3,
      userId: weatherUser.id,
      scheduleSpecs: [
        wateringSpec({
          frequencyDays: 7,
          lastCareAt: new Date(now - 3 * oneDayMs),
          nextCareAt: new Date(now + 6 * oneDayMs),
        }),
      ],
    })

    const { commands } = await readjust(
      userScopes,
      buildContextMap(moderateCtx),
      [plant]
    )

    expect(commands).toEqual([
      {
        reason: 'weather',
        moves: [
          {
            plantId: plant.id,
            careType: 'watering',
            move: DueMove.By({ days: -2 }),
          },
        ],
      },
    ])
  })

  it('asks for no move when the weather-adjusted day matches the stored one', async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * oneDayMs)
    const plant = createTestPlant({
      id: 'plant-no-change',
      name: 'Correct Schedule Plant',
      category: 'tropical',
      wateringRating: 3,
      userId: weatherUser.id,
      scheduleSpecs: [
        wateringSpec({
          frequencyDays: 7,
          lastCareAt: threeDaysAgo,
          nextCareAt: new Date(threeDaysAgo.getTime() + 7 * oneDayMs),
        }),
      ],
    })

    const { moves } = await readjust(userScopes, buildContextMap(moderateCtx), [
      plant,
    ])

    expect(moves).toEqual([])
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
          nextCareAt: new Date(Date.now() + 10 * oneDayMs),
        }),
      ],
    })

    const { commands } = await readjust(
      userScopes,
      buildContextMap(moderateCtx),
      [plant]
    )

    expect(commands).toEqual([])
  })

  it('should handle user with no plants gracefully', async () => {
    const { commands } = await readjust(
      userScopes,
      buildContextMap(moderateCtx)
    )

    expect(commands).toEqual([])
  })

  it('should skip user when no weather context available for their location', async () => {
    const plant = createTestPlant({
      id: 'plant-no-ctx',
      name: 'No Context Plant',
      userId: weatherUser.id,
      scheduleSpecs: [
        wateringSpec({
          frequencyDays: 7,
          lastCareAt: new Date(Date.now() - 3 * oneDayMs),
          nextCareAt: new Date(Date.now() + 10 * oneDayMs),
        }),
      ],
    })

    const { commands } = await readjust(userScopes, new Map(), [plant])

    expect(commands).toEqual([])
  })

  it('should skip when no weather-enabled users exist', async () => {
    const { commands } = await readjust([], buildContextMap(moderateCtx))

    expect(commands).toEqual([])
  })

  it('should process multiple plants for a single user', async () => {
    const now = Date.now()
    const threeDaysAgo = new Date(now - 3 * oneDayMs)
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
            nextCareAt: new Date(now + 15 * oneDayMs),
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
            nextCareAt: new Date(now + 30 * oneDayMs),
          }),
        ],
      }),
    ]

    const { moves } = await readjust(
      userScopes,
      buildContextMap(moderateCtx),
      plants
    )

    expect(
      Array.sort(
        Array.map(moves, (move) => move.plantId),
        Order.String
      )
    ).toEqual(['plant-multi-1', 'plant-multi-2'])
  })
})

describe('readjustCareSchedules for a Canopy', () => {
  const canopy = createTestCanopyRow({
    id: mockCanopyId,
    timezone: 'UTC',
    latitude: 48.86,
    longitude: 2.35,
  })

  const readjustCanopy = (contextMap: ReadonlyMap<string, WeatherContext>) =>
    readjust(
      weatherScopes([], [canopy]),
      contextMap,
      [
        createTestPlant({
          id: 'canopy-plant',
          name: 'Shared Fern',
          category: 'Foliage',
          wateringRating: 3,
          userId: null,
          canopyId: mockCanopyId,
          createdByUserId: weatherUser.id,
          roomId: 'canopy-balcony',
          scheduleSpecs: [
            wateringSpec({
              frequencyDays: 7,
              lastCareAt: new Date(Date.now() - 3 * oneDayMs),
              nextCareAt: new Date(Date.now() + 4 * oneDayMs),
            }),
          ],
        }),
      ],
      [
        {
          id: 'canopy-balcony',
          name: 'Balcony',
          icon: '🌿',
          luminosity: 40000,
          isOutdoor: true,
        },
      ]
    )

  it('asks Care to move the plant of a located Canopy', async () => {
    const { moves } = await readjustCanopy(
      buildContextMap(buildWeatherCtx(parisWinterForecast))
    )

    expect(Array.map(moves, (move) => [move.plantId, move.careType])).toEqual([
      ['canopy-plant', 'watering'],
    ])
  })

  it('asks for no move of a Canopy plant when its location has no weather context', async () => {
    const { commands } = await readjustCanopy(
      new Map([['40.71_-74.01', buildWeatherCtx(parisWinterForecast)]])
    )

    expect(commands).toEqual([])
  })
})
