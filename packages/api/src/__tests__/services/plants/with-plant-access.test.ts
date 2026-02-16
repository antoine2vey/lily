import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { withPlantAuth } from '@lily/api/services/plants/helpers/with-plant-access'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('withPlantAuth', () => {
  const createLayer = (userId: string, delegationData = {}) =>
    Layer.mergeAll(
      createMockPlantRepository({ plants: mockPlants }),
      createMockCurrentUser({ id: userId }),
      createMockDelegationRepository(delegationData)
    )

  it('should allow the plant owner to access their plant', async () => {
    const result = await Effect.runPromise(
      Effect.succeed('ok').pipe(
        withPlantAuth('plant-1'),
        Effect.provide(createLayer('user-1'))
      )
    )

    expect(result).toBe('ok')
  })

  it('should allow an active caretaker to access a delegated plant', async () => {
    const result = await Effect.runPromise(
      Effect.succeed('ok').pipe(
        withPlantAuth('plant-1'),
        Effect.provide(
          createLayer('user-3', {
            delegations: [
              {
                id: 'delegation-1',
                ownerId: 'user-1',
                caretakerId: 'user-3',
                status: 'active',
                message: null,
                startDate: new Date('2024-01-01'),
                endDate: new Date('2025-12-31'),
                respondedAt: new Date(),
                canceledAt: null,
                completedAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
            delegationPlants: [
              { delegationId: 'delegation-1', plantId: 'plant-1' },
            ],
          })
        )
      )
    )

    expect(result).toBe('ok')
  })

  it('should fail with PlantNotAuthorizedError for unauthorized user', async () => {
    const exit = await Effect.runPromiseExit(
      Effect.succeed('ok').pipe(
        withPlantAuth('plant-1'),
        Effect.provide(createLayer('user-3'))
      )
    )

    expect(Exit.isFailure(exit)).toBe(true)
  })

  it('should fail with PlantNotFoundError for non-existent plant', async () => {
    const exit = await Effect.runPromiseExit(
      Effect.succeed('ok').pipe(
        withPlantAuth('non-existent'),
        Effect.provide(createLayer('user-1'))
      )
    )

    expect(Exit.isFailure(exit)).toBe(true)
  })

  it('should deny access for caretaker with non-active delegation', async () => {
    const exit = await Effect.runPromiseExit(
      Effect.succeed('ok').pipe(
        withPlantAuth('plant-1'),
        Effect.provide(
          createLayer('user-3', {
            delegations: [
              {
                id: 'delegation-1',
                ownerId: 'user-1',
                caretakerId: 'user-3',
                status: 'pending',
                message: null,
                startDate: new Date('2024-01-01'),
                endDate: new Date('2025-12-31'),
                respondedAt: null,
                canceledAt: null,
                completedAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
            delegationPlants: [
              { delegationId: 'delegation-1', plantId: 'plant-1' },
            ],
          })
        )
      )
    )

    expect(Exit.isFailure(exit)).toBe(true)
  })
})
