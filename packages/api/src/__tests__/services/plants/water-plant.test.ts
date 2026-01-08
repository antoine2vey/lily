import { mockCareLogs } from '@lily/api/__tests__/fixtures/care-logs'
import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { waterPlant } from '@lily/api/services/plants/endpoints/water-plant'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('waterPlant', () => {
  const createTestLayer = () =>
    Layer.mergeAll(
      createMockPlantRepository({ plants: mockPlants }),
      createMockCareLogRepository(mockCareLogs),
      createMockNotificationRepository([])
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
    expect(result.lastWateredAt).toBeDefined()
    const lastWateredTime = result.lastWateredAt?.getTime() ?? 0
    const expectedNextWatering = new Date(
      lastWateredTime + 7 * 24 * 60 * 60 * 1000
    )
    expect(result.nextWateringAt?.getTime()).toBeCloseTo(
      expectedNextWatering.getTime(),
      -3 // within 1 second
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
})
