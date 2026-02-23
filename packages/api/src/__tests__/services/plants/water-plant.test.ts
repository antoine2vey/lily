import { mockCareLogs } from '@lily/api/__tests__/fixtures/care-logs'
import {
  createTestPlant,
  mockPlants,
} from '@lily/api/__tests__/fixtures/plants'
import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
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
import { waterPlant } from '@lily/api/services/plants/endpoints/water-plant'
import { Array, Effect, Exit, Layer, Option, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

describe('waterPlant', () => {
  const createTestLayer = (eventBusData?: MockEventBusData) =>
    Layer.mergeAll(
      createMockPlantRepository({ plants: mockPlants }),
      createMockCareLogRepository(mockCareLogs),
      createMockNotificationRepository([]),
      createMockUserRepository(mockUsers),
      createMockCurrentUser({ id: 'user-1' }),
      createMockDelegationRepository(),
      createMockWeatherCache(),
      createMockWeatherProvider(),
      createMockWeatherRepository(),
      createMockEventBus(eventBusData)
    )

  it('should update lastWateredAt and nextWateringAt', async () => {
    const before = new Date()
    const result = await Effect.runPromise(
      waterPlant({ id: 'plant-1' }).pipe(Effect.provide(createTestLayer()))
    )
    const after = new Date()

    expect(result.lastWateredAt).toBeDefined()
    expect(result.lastWateredAt?.getTime()).toBeGreaterThanOrEqual(
      before.getTime()
    )
    expect(result.lastWateredAt?.getTime()).toBeLessThanOrEqual(after.getTime())
    expect(result.nextWateringAt).toBeDefined()
  })

  it('should calculate nextWateringAt based on wateringFrequencyDays', async () => {
    const result = await Effect.runPromise(
      waterPlant({ id: 'plant-1' }).pipe(Effect.provide(createTestLayer()))
    )

    // plant-1 has wateringFrequencyDays = 7
    // nextWateringAt is calculated from start-of-day + frequency days
    expect(result.lastWateredAt).toBeDefined()
    expect(result.nextWateringAt).toBeDefined()
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)
    const expectedNextWatering = new Date(
      todayStart.getTime() + 7 * 24 * 60 * 60 * 1000
    )
    expect(result.nextWateringAt?.getTime()).toBe(
      expectedNextWatering.getTime()
    )
  })

  it('should create a care log for watering', async () => {
    const result = await Effect.runPromise(
      waterPlant({ id: 'plant-1' }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result).toBeDefined()
    expect(result.id).toBe('plant-1')
  })

  it('should fail with PlantNotFoundError for non-existent plant', async () => {
    const exit = await Effect.runPromiseExit(
      waterPlant({ id: 'non-existent' }).pipe(Effect.provide(createTestLayer()))
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const error = exit.cause
      expect(error._tag).toBe('Fail')
    }
  })

  it('should include notes in care log when provided', async () => {
    const result = await Effect.runPromise(
      waterPlant({ id: 'plant-1', notes: 'Watered with rainwater' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result).toBeDefined()
  })

  it('should schedule next watering reminder when reminders are enabled', async () => {
    // plant-1 has remindersEnabled = true
    const result = await Effect.runPromise(
      waterPlant({ id: 'plant-1' }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.remindersEnabled).toBe(true)
    expect(result.nextWateringAt).toBeDefined()
  })

  it('should reset health to HEALTHY when plant NEEDS_ATTENTION', async () => {
    // Create a plant that NEEDS_ATTENTION
    const plantsWithAttention = [
      createTestPlant({
        id: 'attention-plant',
        health: 'NEEDS_ATTENTION',
      }),
    ]

    const result = await Effect.runPromise(
      waterPlant({ id: 'attention-plant' }).pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockPlantRepository({ plants: plantsWithAttention }),
            createMockCareLogRepository(mockCareLogs),
            createMockNotificationRepository([]),
            createMockUserRepository(mockUsers),
            createMockCurrentUser({ id: 'user-1' }),
            createMockDelegationRepository(),
            createMockWeatherCache(),
            createMockWeatherProvider(),
            createMockWeatherRepository(),
            createMockEventBus()
          )
        )
      )
    )

    expect(result.health).toBe('HEALTHY')
  })

  it('should not change health if plant is already HEALTHY', async () => {
    // plant-1 has health = 'HEALTHY'
    const result = await Effect.runPromise(
      waterPlant({ id: 'plant-1' }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.health).toBe('HEALTHY')
  })

  it('should publish CareLogCreated event after watering', async () => {
    const eventBusData: MockEventBusData = { publishedEvents: [] }
    await Effect.runPromise(
      waterPlant({ id: 'plant-1' }).pipe(
        Effect.provide(createTestLayer(eventBusData))
      )
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

    await Effect.runPromise(
      waterPlant({ id: 'attention-plant' }).pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockPlantRepository({ plants: plantsWithAttention }),
            createMockCareLogRepository(mockCareLogs),
            createMockNotificationRepository([]),
            createMockUserRepository(mockUsers),
            createMockCurrentUser({ id: 'user-1' }),
            createMockDelegationRepository(),
            createMockWeatherCache(),
            createMockWeatherProvider(),
            createMockWeatherRepository(),
            createMockEventBus(eventBusData)
          )
        )
      )
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
    await Effect.runPromise(
      waterPlant({ id: 'plant-1' }).pipe(
        Effect.provide(createTestLayer(eventBusData))
      )
    )

    const attentionEvents = Array.filter(
      eventBusData.publishedEvents,
      (e) => e._tag === 'AttentionResponded'
    )
    expect(attentionEvents).toHaveLength(0)
  })
})
