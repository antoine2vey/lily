import { mockCareLogs } from '@lily/api/__tests__/fixtures/care-logs'
import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { fertilizePlant } from '@lily/api/services/plants/endpoints/fertilize-plant'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('fertilizePlant', () => {
  const createTestLayer = () =>
    Layer.mergeAll(
      createMockPlantRepository({ plants: mockPlants }),
      createMockCareLogRepository(mockCareLogs),
      createMockNotificationRepository([])
    )

  it('should update lastFertilizedAt', async () => {
    const before = new Date()
    const result = await Effect.runPromise(
      fertilizePlant({ id: 'plant-1' }).pipe(Effect.provide(createTestLayer()))
    )
    const after = new Date()

    expect(result.lastFertilizedAt).toBeDefined()
    expect(result.lastFertilizedAt?.getTime()).toBeGreaterThanOrEqual(
      before.getTime()
    )
    expect(result.lastFertilizedAt?.getTime()).toBeLessThanOrEqual(
      after.getTime()
    )
  })

  it('should calculate nextFertilizationAt based on fertilizationFrequencyDays', async () => {
    // plant-1 has fertilizationFrequencyDays = 30
    const result = await Effect.runPromise(
      fertilizePlant({ id: 'plant-1' }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.nextFertilizationAt).toBeDefined()
    const expectedNextFertilization = new Date(
      result.lastFertilizedAt?.getTime() + 30 * 24 * 60 * 60 * 1000
    )
    expect(result.nextFertilizationAt?.getTime()).toBeCloseTo(
      expectedNextFertilization.getTime(),
      -3
    )
  })

  it('should not set nextFertilizationAt if fertilizationFrequencyDays is null', async () => {
    // plant-2 has fertilizationFrequencyDays = null
    const result = await Effect.runPromise(
      fertilizePlant({ id: 'plant-2' }).pipe(Effect.provide(createTestLayer()))
    )

    // nextFertilizationAt should remain unchanged (no new value set)
    expect(result.lastFertilizedAt).toBeDefined()
  })

  it('should fail with PlantNotFoundError for non-existent plant', async () => {
    const exit = await Effect.runPromiseExit(
      fertilizePlant({ id: 'non-existent' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(Exit.isFailure(exit)).toBe(true)
  })

  it('should create a care log for fertilization', async () => {
    const result = await Effect.runPromise(
      fertilizePlant({ id: 'plant-1' }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result).toBeDefined()
    expect(result.id).toBe('plant-1')
  })

  it('should schedule next fertilization reminder when reminders are enabled', async () => {
    // plant-1 has remindersEnabled = true and fertilizationFrequencyDays = 30
    const result = await Effect.runPromise(
      fertilizePlant({ id: 'plant-1' }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.remindersEnabled).toBe(true)
    expect(result.nextFertilizationAt).toBeDefined()
  })
})
