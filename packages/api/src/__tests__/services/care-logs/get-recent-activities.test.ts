import { mockCareLogs } from '@lily/api/__tests__/fixtures/care-logs'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import {
  CareLogRepository,
  type FindRecentParams,
} from '@lily/api/repositories/care-log.repository'
import { getRecentActivities } from '@lily/api/services/care-logs/endpoints/get-recent-activities'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('getRecentActivities', () => {
  const createTestLayer = () =>
    Layer.mergeAll(
      createMockCareLogRepository(mockCareLogs),
      createMockCurrentUser({ id: 'user-1' })
    )

  it('should return recent activities with default limit of 10', async () => {
    const result = await Effect.runPromise(
      getRecentActivities({}).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.items).toBeDefined()
    expect(result.items.length).toBeLessThanOrEqual(10)
  })

  it('should return recent activities with custom limit', async () => {
    const result = await Effect.runPromise(
      getRecentActivities({ limit: 2 }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.items.length).toBe(2)
  })

  it('should return activities sorted by date descending', async () => {
    const result = await Effect.runPromise(
      getRecentActivities({}).pipe(Effect.provide(createTestLayer()))
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

  it('should include plant name in activity items', async () => {
    const result = await Effect.runPromise(
      getRecentActivities({}).pipe(Effect.provide(createTestLayer()))
    )

    result.items.forEach((item) => {
      expect(item.plantName).toBeDefined()
      expect(typeof item.plantName).toBe('string')
    })
  })

  it('should return activity items with required fields', async () => {
    const result = await Effect.runPromise(
      getRecentActivities({}).pipe(Effect.provide(createTestLayer()))
    )

    result.items.forEach((item) => {
      expect(item.id).toBeDefined()
      expect(item.type).toBeDefined()
      expect(item.plantId).toBeDefined()
      expect(item.date).toBeDefined()
    })
  })

  it('should handle empty results', async () => {
    const layer = Layer.mergeAll(
      createMockCareLogRepository([]),
      createMockCurrentUser({ id: 'user-1' })
    )

    const result = await Effect.runPromise(
      getRecentActivities({}).pipe(Effect.provide(layer))
    )

    expect(result.items).toEqual([])
  })

  const askedFor = (params: { limit?: number }) => {
    const asked: FindRecentParams[] = []
    const recording = Layer.effect(
      CareLogRepository,
      Effect.gen(function* () {
        const repo = yield* CareLogRepository
        return {
          ...repo,
          findRecentByUserId: (p: FindRecentParams) => {
            asked.push(p)
            return repo.findRecentByUserId(p)
          },
        }
      })
    ).pipe(Layer.provide(createMockCareLogRepository(mockCareLogs)))
    return Effect.runPromise(
      getRecentActivities(params).pipe(
        Effect.provide(
          Layer.mergeAll(
            recording,
            createMockCurrentUser({ id: 'different-user' })
          )
        ),
        Effect.as(asked)
      )
    )
  }

  it('reads the activities of the CurrentUser, with a limit of 10 by default', async () => {
    expect(await askedFor({})).toEqual([
      { userId: 'different-user', limit: 10 },
    ])
  })

  it('should respect limit parameter when provided', async () => {
    const result = await Effect.runPromise(
      getRecentActivities({ limit: 1 }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.items.length).toBe(1)
  })

  it('passes a given limit through', async () => {
    expect(await askedFor({ limit: 3 })).toEqual([
      { userId: 'different-user', limit: 3 },
    ])
  })
})
