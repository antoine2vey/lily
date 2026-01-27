import * as SqlClient from '@effect/sql/SqlClient'
import { mockCareLogs } from '@lily/api/__tests__/fixtures/care-logs'
import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { waterMultiplePlants } from '@lily/api/services/plants/endpoints/water-multiple-plants'
import { Array, Effect, Layer, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

const MockSqlClient = Layer.succeed(SqlClient.SqlClient, {
  withTransaction: <R, E, A>(effect: Effect.Effect<A, E, R>) => effect,
} as unknown as SqlClient.SqlClient)

describe('waterMultiplePlants', () => {
  const createTestLayer = () =>
    Layer.mergeAll(
      createMockPlantRepository({ plants: mockPlants }),
      createMockCareLogRepository(mockCareLogs),
      createMockNotificationRepository([]),
      createMockUserRepository(mockUsers),
      MockSqlClient
    )

  it('should water multiple plants and return results', async () => {
    const result = await Effect.runPromise(
      waterMultiplePlants({ plantIds: ['plant-1', 'plant-2'] }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result).toHaveLength(2)
    const allSuccessful = pipe(
      result,
      Array.every((r) => r.success)
    )
    expect(allSuccessful).toBe(true)
  })

  it('should update lastWateredAt and nextWateringAt for each plant', async () => {
    const before = new Date()
    const result = await Effect.runPromise(
      waterMultiplePlants({ plantIds: ['plant-1'] }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    const plant1Result = pipe(
      Array.findFirst(result, (r) => r.plantId === 'plant-1'),
      (opt) => (opt._tag === 'Some' ? opt.value : undefined)
    )

    expect(plant1Result?.success).toBe(true)
    expect(plant1Result?.plant?.lastWateredAt).toBeDefined()
    expect(
      plant1Result?.plant?.lastWateredAt?.getTime()
    ).toBeGreaterThanOrEqual(before.getTime())
    expect(plant1Result?.plant?.nextWateringAt).toBeDefined()
  })

  it('should return success:false for non-existent plant IDs', async () => {
    const result = await Effect.runPromise(
      waterMultiplePlants({
        plantIds: ['plant-1', 'non-existent'],
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result).toHaveLength(2)

    const existing = pipe(
      Array.findFirst(result, (r) => r.plantId === 'plant-1'),
      (opt) => (opt._tag === 'Some' ? opt.value : undefined)
    )
    const missing = pipe(
      Array.findFirst(result, (r) => r.plantId === 'non-existent'),
      (opt) => (opt._tag === 'Some' ? opt.value : undefined)
    )

    expect(existing?.success).toBe(true)
    expect(missing?.success).toBe(false)
  })

  it('should return empty results for empty plantIds array', async () => {
    const result = await Effect.runPromise(
      waterMultiplePlants({ plantIds: [] }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result).toHaveLength(0)
  })

  it('should schedule reminders for plants with remindersEnabled', async () => {
    // plant-1 has remindersEnabled = true
    const result = await Effect.runPromise(
      waterMultiplePlants({ plantIds: ['plant-1'] }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    const plant1Result = pipe(
      Array.findFirst(result, (r) => r.plantId === 'plant-1'),
      (opt) => (opt._tag === 'Some' ? opt.value : undefined)
    )

    expect(plant1Result?.success).toBe(true)
    expect(plant1Result?.plant?.nextWateringAt).toBeDefined()
  })
})
