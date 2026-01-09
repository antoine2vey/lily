import { mockCareLogs } from '@lily/api/__tests__/fixtures/care-logs'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { getCareLogs } from '@lily/api/services/care-logs/endpoints/get-care-logs'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('getCareLogs', () => {
  const createTestLayer = () =>
    Layer.mergeAll(
      createMockCareLogRepository(mockCareLogs),
      createMockEventBus(),
      createMockCurrentUser({ id: 'user-1' })
    )

  it('should return care logs for a plant with pagination info', async () => {
    const result = await Effect.runPromise(
      getCareLogs({ plantId: 'plant-1' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.items.length).toBe(3)
    expect(result.items.every((log) => log.plantId === 'plant-1')).toBe(true)
    expect(result.total).toBe(3)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(20)
    expect(result.hasMore).toBe(false)
  })

  it('should return empty array when no logs exist for plant', async () => {
    const result = await Effect.runPromise(
      getCareLogs({ plantId: 'non-existent-plant' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
    expect(result.hasMore).toBe(false)
  })

  it('should filter by watering type', async () => {
    const result = await Effect.runPromise(
      getCareLogs({ plantId: 'plant-1', type: 'watering' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.items.every((log) => log.type === 'watering')).toBe(true)
    expect(result.items.length).toBe(2)
  })

  it('should filter by fertilization type', async () => {
    const result = await Effect.runPromise(
      getCareLogs({ plantId: 'plant-1', type: 'fertilization' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.items.every((log) => log.type === 'fertilization')).toBe(true)
    expect(result.items.length).toBe(1)
  })

  it('should return logs sorted by date descending', async () => {
    const result = await Effect.runPromise(
      getCareLogs({ plantId: 'plant-1' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    for (let i = 0; i < result.items.length - 1; i++) {
      const current = result.items[i]
      const next = result.items[i + 1]
      if (current && next) {
        expect(current.date.getTime()).toBeGreaterThanOrEqual(
          next.date.getTime()
        )
      }
    }
  })

  it('should respect page and limit parameters', async () => {
    const result = await Effect.runPromise(
      getCareLogs({ plantId: 'plant-1', page: 1, limit: 2 }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.items.length).toBe(2)
    expect(result.total).toBe(3)
    expect(result.hasMore).toBe(true)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(2)
  })
})
