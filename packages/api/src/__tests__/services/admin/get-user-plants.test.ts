import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { getUserPlants } from '@lily/api/services/admin/endpoints/get-user-plants'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('getUserPlants', () => {
  // All three plants belong to user-1; user-2 has none.
  const plants = [
    createTestPlant({ id: 'p1', userId: 'user-1' }),
    createTestPlant({ id: 'p2', userId: 'user-1' }),
    createTestPlant({ id: 'p3', userId: 'user-1' }),
  ]
  const layer = Layer.mergeAll(
    createMockUserRepository(mockUsers),
    createMockPlantRepository({ plants })
  )

  it("returns the target user's plants, paginated", async () => {
    const result = await Effect.runPromise(
      getUserPlants('user-1', { page: '1', limit: '2' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result.total).toBe(3)
    expect(result.items.length).toBe(2)
    expect(result.hasMore).toBe(true)
  })

  it('returns the second page', async () => {
    const result = await Effect.runPromise(
      getUserPlants('user-1', { page: '2', limit: '2' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result.items.length).toBe(1)
    expect(result.hasMore).toBe(false)
  })

  it('returns empty for an existing user with no plants (timezone resolved)', async () => {
    // user-2 exists with timezone 'America/New_York' and owns no plants.
    const result = await Effect.runPromise(
      getUserPlants('user-2', { page: '1', limit: '20' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result.total).toBe(0)
    expect(result.items.length).toBe(0)
  })

  it('fails with UserNotFoundError for an unknown user', async () => {
    const result = await Effect.runPromiseExit(
      getUserPlants('non-existent', { page: '1', limit: '20' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
  })
})
