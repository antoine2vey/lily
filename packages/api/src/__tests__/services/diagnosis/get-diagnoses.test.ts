import { mockDiagnoses } from '@lily/api/__tests__/fixtures/diagnoses'
import { createMockDiagnosisRepository } from '@lily/api/__tests__/mocks/diagnosis.repository'
import { createMockGCSService } from '@lily/api/__tests__/mocks/gcs.service'
import { getDiagnoses } from '@lily/api/services/diagnosis/endpoints/get-diagnoses'
import { Array, Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('getDiagnoses', () => {
  const createTestLayer = () =>
    Layer.mergeAll(
      createMockDiagnosisRepository(mockDiagnoses),
      createMockGCSService()
    )
  const own = { viewerId: 'user-1', household: false }
  const household = { viewerId: 'user-1', household: true }

  it('should return diagnoses for a plant with pagination info', async () => {
    const result = await Effect.runPromise(
      getDiagnoses({ plantId: 'plant-1', view: own }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.items.length).toBe(2)
    expect(Array.every(result.items, (d) => d.plantId === 'plant-1')).toBe(true)
    expect(result.total).toBe(2)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(20)
    expect(result.hasMore).toBe(false)
  })

  it('should return empty array when no diagnoses exist for plant', async () => {
    const result = await Effect.runPromise(
      getDiagnoses({ plantId: 'non-existent-plant', view: own }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
    expect(result.hasMore).toBe(false)
  })

  it('returns only the viewer’s diagnoses on a personal plant', async () => {
    const result = await Effect.runPromise(
      getDiagnoses({ plantId: 'plant-3', view: own }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
  })

  it('returns every member’s diagnoses on a Canopy plant', async () => {
    const result = await Effect.runPromise(
      getDiagnoses({ plantId: 'plant-3', view: household }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(Array.map(result.items, (d) => d.id)).toEqual(['diagnosis-4'])
    expect(result.total).toBe(1)
  })

  it('should return diagnoses sorted by date descending', async () => {
    const result = await Effect.runPromise(
      getDiagnoses({ plantId: 'plant-1', view: own }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    for (let i = 0; i < result.items.length - 1; i++) {
      const current = result.items[i]
      const next = result.items[i + 1]
      if (current && next) {
        expect(current.createdAt.getTime()).toBeGreaterThanOrEqual(
          next.createdAt.getTime()
        )
      }
    }
  })

  it('should respect page and limit parameters', async () => {
    const result = await Effect.runPromise(
      getDiagnoses({ plantId: 'plant-1', view: own, page: 1, limit: 1 }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.items.length).toBe(1)
    expect(result.total).toBe(2)
    expect(result.hasMore).toBe(true)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(1)
  })
})
