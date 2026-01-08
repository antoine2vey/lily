import { mockCareLogs } from '@lily/api/__tests__/fixtures/care-logs'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockSession } from '@lily/api/__tests__/mocks/session'
import type { AppEvent } from '@lily/api/events'
import { createCareLog } from '@lily/api/services/care-logs/endpoints/create-care-log'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('createCareLog', () => {
  const createTestLayer = () =>
    Layer.mergeAll(
      createMockCareLogRepository(mockCareLogs),
      createMockEventBus(),
      createMockSession({ userId: 'user-1' })
    )

  it('should create a new care log', async () => {
    const result = await Effect.runPromise(
      createCareLog('plant-1', { type: 'watering' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.type).toBe('watering')
    expect(result.plantId).toBe('plant-1')
    expect(result.id).toBeDefined()
  })

  it('should return the created log with an id', async () => {
    const result = await Effect.runPromise(
      createCareLog('plant-1', { type: 'fertilization' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.id).toBeTruthy()
    expect(typeof result.id).toBe('string')
  })

  it('should set notes when provided', async () => {
    const result = await Effect.runPromise(
      createCareLog('plant-1', {
        type: 'watering',
        notes: 'Test notes',
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.notes).toBe('Test notes')
  })

  it('should set photoUrl when provided', async () => {
    const result = await Effect.runPromise(
      createCareLog('plant-1', {
        type: 'fertilization',
        photoUrl: 'https://example.com/photo.jpg',
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.photoUrl).toBe('https://example.com/photo.jpg')
  })

  it('should use current date when date not provided', async () => {
    const before = new Date()
    const result = await Effect.runPromise(
      createCareLog('plant-1', { type: 'watering' }).pipe(
        Effect.provide(createTestLayer())
      )
    )
    const after = new Date()

    expect(result.date.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(result.date.getTime()).toBeLessThanOrEqual(after.getTime())
  })

  it('should use provided date when specified', async () => {
    const customDate = new Date('2024-06-15')
    const result = await Effect.runPromise(
      createCareLog('plant-1', {
        type: 'watering',
        date: customDate,
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.date).toEqual(customDate)
  })

  it('should publish CareLogCreated event', async () => {
    const publishedEvents: AppEvent[] = []
    const eventBusMock = createMockEventBus({ publishedEvents })

    const result = await Effect.runPromise(
      createCareLog('plant-1', { type: 'watering' }).pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockCareLogRepository(mockCareLogs),
            eventBusMock,
            createMockSession({ userId: 'user-1' })
          )
        )
      )
    )

    expect(publishedEvents.length).toBe(1)
    expect(publishedEvents[0]).toMatchObject({
      _tag: 'CareLogCreated',
      userId: 'user-1',
      plantId: 'plant-1',
      careLogId: result.id,
      type: 'watering',
    })
  })
})
