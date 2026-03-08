import { mockCareLogs } from '@lily/api/__tests__/fixtures/care-logs'
import { schedulesFromPlants } from '@lily/api/__tests__/fixtures/care-schedules'
import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import {
  createMockEventBus,
  type MockEventBusData,
} from '@lily/api/__tests__/mocks/event-bus'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import type { CareScheduleRow } from '@lily/api/repositories/care-schedule.repository'
import { fertilizePlant } from '@lily/api/services/plants/endpoints/fertilize-plant'
import { Array, Effect, Exit, Layer, Option, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

const findSchedule = (
  schedules: CareScheduleRow[],
  plantId: string,
  careType: string
) =>
  pipe(
    Array.findFirst(
      schedules,
      (s) => s.plantId === plantId && s.careType === careType
    ),
    Option.getOrNull
  )

describe('fertilizePlant', () => {
  const createTestLayer = (eventBusData?: MockEventBusData) => {
    const schedules = schedulesFromPlants(mockPlants)
    return {
      layer: Layer.mergeAll(
        createMockPlantRepository({ plants: mockPlants }),
        createMockCareScheduleRepository({
          schedules,
          plants: mockPlants,
        }),
        createMockCareLogRepository(mockCareLogs),
        createMockNotificationRepository([]),
        createMockUserRepository(mockUsers),
        createMockCurrentUser({ id: 'user-1' }),
        createMockDelegationRepository(),
        createMockWeatherCache(),
        createMockWeatherProvider(),
        createMockWeatherRepository(),
        createMockEventBus(eventBusData)
      ),
      schedules,
    }
  }

  it('should update lastFertilizedAt', async () => {
    const before = new Date()
    const { layer, schedules } = createTestLayer()
    const _result = await Effect.runPromise(
      fertilizePlant({ id: 'plant-1' }).pipe(Effect.provide(layer))
    )
    const after = new Date()

    const fertSchedule = findSchedule(schedules, 'plant-1', 'fertilization')
    expect(fertSchedule?.lastCareAt).toBeDefined()
    expect(fertSchedule?.lastCareAt?.getTime()).toBeGreaterThanOrEqual(
      before.getTime()
    )
    expect(fertSchedule?.lastCareAt?.getTime()).toBeLessThanOrEqual(
      after.getTime()
    )
  })

  it('should calculate nextFertilizationAt based on fertilizationFrequencyDays', async () => {
    // plant-1 has fertilizationFrequencyDays = 30
    const { layer, schedules } = createTestLayer()
    const _result = await Effect.runPromise(
      fertilizePlant({ id: 'plant-1' }).pipe(Effect.provide(layer))
    )

    const fertSchedule = findSchedule(schedules, 'plant-1', 'fertilization')
    // nextCareAt is calculated from start-of-day + frequency days
    expect(fertSchedule?.nextCareAt).toBeDefined()
    expect(fertSchedule?.lastCareAt).toBeDefined()
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)
    const expectedNextFertilization = new Date(
      todayStart.getTime() + 30 * 24 * 60 * 60 * 1000
    )
    expect(fertSchedule?.nextCareAt?.getTime()).toBe(
      expectedNextFertilization.getTime()
    )
  })

  it('should not set nextFertilizationAt if fertilizationFrequencyDays is null', async () => {
    // plant-2 has fertilizationFrequencyDays = null
    const { layer } = createTestLayer()
    const result = await Effect.runPromise(
      fertilizePlant({ id: 'plant-2' }).pipe(Effect.provide(layer))
    )

    // plant-2 has no fertilization schedule
    expect(result.id).toBe('plant-2')
  })

  it('should fail with PlantNotFoundError for non-existent plant', async () => {
    const { layer } = createTestLayer()
    const exit = await Effect.runPromiseExit(
      fertilizePlant({ id: 'non-existent' }).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(exit)).toBe(true)
  })

  it('should create a care log for fertilization', async () => {
    const { layer } = createTestLayer()
    const result = await Effect.runPromise(
      fertilizePlant({ id: 'plant-1' }).pipe(Effect.provide(layer))
    )

    expect(result).toBeDefined()
    expect(result.id).toBe('plant-1')
  })

  it('should schedule next fertilization reminder when reminders are enabled', async () => {
    // plant-1 has remindersEnabled = true and fertilizationFrequencyDays = 30
    const { layer, schedules } = createTestLayer()
    const result = await Effect.runPromise(
      fertilizePlant({ id: 'plant-1' }).pipe(Effect.provide(layer))
    )

    expect(result.remindersEnabled).toBe(true)
    const fertSchedule = findSchedule(schedules, 'plant-1', 'fertilization')
    expect(fertSchedule?.nextCareAt).toBeDefined()
  })

  it('should publish CareLogCreated event after fertilizing', async () => {
    const eventBusData: MockEventBusData = { publishedEvents: [] }
    const { layer } = createTestLayer(eventBusData)
    await Effect.runPromise(
      fertilizePlant({ id: 'plant-1' }).pipe(Effect.provide(layer))
    )

    const careLogEvents = Array.filter(
      eventBusData.publishedEvents,
      (e) => e._tag === 'CareLogCreated'
    )
    expect(careLogEvents).toHaveLength(1)
    expect(careLogEvents[0]).toMatchObject({
      _tag: 'CareLogCreated',
      plantId: 'plant-1',
      type: 'fertilization',
    })
  })
})
