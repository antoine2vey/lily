import { mockCareLogs } from '@lily/api/__tests__/fixtures/care-logs'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { getCareLogs } from '@lily/api/services/care-logs/endpoints/get-care-logs'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

describe('getCareLogs', () => {
  it('should return care logs for a plant', async () => {
    const result = await Effect.runPromise(
      getCareLogs('plant-1').pipe(
        Effect.provide(createMockCareLogRepository(mockCareLogs))
      )
    )

    expect(result.length).toBe(3)
    expect(result.every((log) => log.plantId === 'plant-1')).toBe(true)
  })

  it('should return empty array when no logs exist for plant', async () => {
    const result = await Effect.runPromise(
      getCareLogs('non-existent-plant').pipe(
        Effect.provide(createMockCareLogRepository(mockCareLogs))
      )
    )

    expect(result).toEqual([])
  })

  it('should filter by watering type', async () => {
    const result = await Effect.runPromise(
      getCareLogs('plant-1', 'watering').pipe(
        Effect.provide(createMockCareLogRepository(mockCareLogs))
      )
    )

    expect(result.every((log) => log.type === 'watering')).toBe(true)
    expect(result.length).toBe(2)
  })

  it('should filter by fertilization type', async () => {
    const result = await Effect.runPromise(
      getCareLogs('plant-1', 'fertilization').pipe(
        Effect.provide(createMockCareLogRepository(mockCareLogs))
      )
    )

    expect(result.every((log) => log.type === 'fertilization')).toBe(true)
    expect(result.length).toBe(1)
  })

  it('should return logs sorted by date descending', async () => {
    const result = await Effect.runPromise(
      getCareLogs('plant-1').pipe(
        Effect.provide(createMockCareLogRepository(mockCareLogs))
      )
    )

    for (let i = 0; i < result.length - 1; i++) {
      const current = result[i]
      const next = result[i + 1]
      if (current && next) {
        expect(current.date.getTime()).toBeGreaterThanOrEqual(
          next.date.getTime()
        )
      }
    }
  })
})
