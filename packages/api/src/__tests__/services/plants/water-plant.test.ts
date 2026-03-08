import { mockCareLogs } from '@lily/api/__tests__/fixtures/care-logs'
import { schedulesFromPlants } from '@lily/api/__tests__/fixtures/care-schedules'
import {
  createTestPlant,
  mockPlants,
} from '@lily/api/__tests__/fixtures/plants'
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
import { waterPlant } from '@lily/api/services/plants/endpoints/water-plant'
import { Array, Effect, Exit, Layer, Option, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

describe('waterPlant', () => {
  const createTestLayer = (
    eventBusData?: MockEventBusData,
    plantsOverride?: typeof mockPlants
  ) => {
    const plants = plantsOverride ?? mockPlants
    const schedules = schedulesFromPlants(plants)
    return {
      layer: Layer.mergeAll(
        createMockPlantRepository({ plants }),
        createMockCareScheduleRepository({
          schedules,
          plants,
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

  it('should update watering schedule lastCareAt and nextCareAt', async () => {
    const before = new Date()
    const { layer, schedules } = createTestLayer()
    const result = await Effect.runPromise(
      waterPlant({ id: 'plant-1' }).pipe(Effect.provide(layer))
    )
    const after = new Date()

    expect(result).toBeDefined()
    expect(result.id).toBe('plant-1')

    const wateringSched = findSchedule(schedules, 'plant-1', 'watering')
    expect(wateringSched?.lastCareAt).toBeDefined()
    expect(wateringSched?.lastCareAt?.getTime()).toBeGreaterThanOrEqual(
      before.getTime()
    )
    expect(wateringSched?.lastCareAt?.getTime()).toBeLessThanOrEqual(
      after.getTime()
    )
    expect(wateringSched?.nextCareAt).toBeDefined()
  })

  it('should calculate nextCareAt based on watering frequency', async () => {
    const { layer, schedules } = createTestLayer()
    await Effect.runPromise(
      waterPlant({ id: 'plant-1' }).pipe(Effect.provide(layer))
    )

    // plant-1 has wateringFrequencyDays = 7
    const wateringSched = findSchedule(schedules, 'plant-1', 'watering')
    expect(wateringSched?.lastCareAt).toBeDefined()
    expect(wateringSched?.nextCareAt).toBeDefined()
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)
    const expectedNextWatering = new Date(
      todayStart.getTime() + 7 * 24 * 60 * 60 * 1000
    )
    expect(wateringSched?.nextCareAt?.getTime()).toBe(
      expectedNextWatering.getTime()
    )
  })

  it('should create a care log for watering', async () => {
    const { layer } = createTestLayer()
    const result = await Effect.runPromise(
      waterPlant({ id: 'plant-1' }).pipe(Effect.provide(layer))
    )

    expect(result).toBeDefined()
    expect(result.id).toBe('plant-1')
  })

  it('should fail with PlantNotFoundError for non-existent plant', async () => {
    const { layer } = createTestLayer()
    const exit = await Effect.runPromiseExit(
      waterPlant({ id: 'non-existent' }).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const error = exit.cause
      expect(error._tag).toBe('Fail')
    }
  })

  it('should include notes in care log when provided', async () => {
    const { layer } = createTestLayer()
    const result = await Effect.runPromise(
      waterPlant({ id: 'plant-1', notes: 'Watered with rainwater' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result).toBeDefined()
  })

  it('should schedule next watering reminder when reminders are enabled', async () => {
    const { layer, schedules } = createTestLayer()
    // plant-1 has remindersEnabled = true
    const result = await Effect.runPromise(
      waterPlant({ id: 'plant-1' }).pipe(Effect.provide(layer))
    )

    expect(result.remindersEnabled).toBe(true)
    const wateringSched = findSchedule(schedules, 'plant-1', 'watering')
    expect(wateringSched?.nextCareAt).toBeDefined()
  })

  it('should reset health to HEALTHY when plant NEEDS_ATTENTION', async () => {
    const plantsWithAttention = [
      createTestPlant({
        id: 'attention-plant',
        health: 'NEEDS_ATTENTION',
      }),
    ]

    const { layer } = createTestLayer(undefined, plantsWithAttention)
    const result = await Effect.runPromise(
      waterPlant({ id: 'attention-plant' }).pipe(Effect.provide(layer))
    )

    expect(result.health).toBe('HEALTHY')
  })

  it('should not change health if plant is already HEALTHY', async () => {
    const { layer } = createTestLayer()
    // plant-1 has health = 'HEALTHY'
    const result = await Effect.runPromise(
      waterPlant({ id: 'plant-1' }).pipe(Effect.provide(layer))
    )

    expect(result.health).toBe('HEALTHY')
  })

  it('should publish CareLogCreated event after watering', async () => {
    const eventBusData: MockEventBusData = { publishedEvents: [] }
    const { layer } = createTestLayer(eventBusData)
    await Effect.runPromise(
      waterPlant({ id: 'plant-1' }).pipe(Effect.provide(layer))
    )

    const careLogEvents = Array.filter(
      eventBusData.publishedEvents,
      (e) => e._tag === 'CareLogCreated'
    )
    expect(careLogEvents).toHaveLength(1)
    expect(careLogEvents[0]).toMatchObject({
      _tag: 'CareLogCreated',
      plantId: 'plant-1',
      type: 'watering',
    })
  })

  it('should publish AttentionResponded event when plant was NEEDS_ATTENTION', async () => {
    const eventBusData: MockEventBusData = { publishedEvents: [] }
    const plantsWithAttention = [
      createTestPlant({
        id: 'attention-plant',
        health: 'NEEDS_ATTENTION',
      }),
    ]

    const { layer } = createTestLayer(eventBusData, plantsWithAttention)
    await Effect.runPromise(
      waterPlant({ id: 'attention-plant' }).pipe(Effect.provide(layer))
    )

    const attentionEvents = Array.filter(
      eventBusData.publishedEvents,
      (e) => e._tag === 'AttentionResponded'
    )
    expect(attentionEvents).toHaveLength(1)
    expect(attentionEvents[0]).toMatchObject({
      _tag: 'AttentionResponded',
      plantId: 'attention-plant',
    })
  })

  it('should not publish AttentionResponded event when plant is HEALTHY', async () => {
    const eventBusData: MockEventBusData = { publishedEvents: [] }
    const { layer } = createTestLayer(eventBusData)
    await Effect.runPromise(
      waterPlant({ id: 'plant-1' }).pipe(Effect.provide(layer))
    )

    const attentionEvents = Array.filter(
      eventBusData.publishedEvents,
      (e) => e._tag === 'AttentionResponded'
    )
    expect(attentionEvents).toHaveLength(0)
  })
})
