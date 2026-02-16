import {
  mockDelegation1,
  mockDelegation2,
  mockDelegationPlants,
} from '@lily/api/__tests__/fixtures/delegations'
import { mockUser1, mockUser2 } from '@lily/api/__tests__/fixtures/users'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import type { DelegationRow } from '@lily/api/repositories/delegation.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { getDelegatedTasks } from '@lily/api/services/delegation/endpoints/get-delegated-tasks'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const caretakerCurrentUser = Layer.succeed(CurrentUser, {
  id: mockUser2.id,
  name: mockUser2.name,
  email: mockUser2.email,
  image: mockUser2.image,
} as any)

const activeDelegation = {
  ...mockDelegation1,
  status: 'active' as const,
  caretakerId: mockUser2.id,
}

const completedDelegation = {
  ...mockDelegation2,
  id: 'delegation-completed',
  status: 'completed' as const,
  caretakerId: mockUser2.id,
}

const plantsWithFertilization = mockDelegationPlants.map((p) => ({
  ...p,
  nextFertilizationAt: new Date('2024-06-10'),
}))

const createLayer = (
  currentUser: Layer.Layer<CurrentUser>,
  delegations: DelegationRow[] = [activeDelegation],
  delegationPlants = [
    { delegationId: activeDelegation.id, plantId: 'plant-1' },
    { delegationId: activeDelegation.id, plantId: 'plant-2' },
  ]
) =>
  Layer.mergeAll(
    currentUser,
    createMockDelegationRepository({
      delegations,
      delegationPlants,
      users: [
        { id: mockUser1.id, name: mockUser1.name, image: mockUser1.image },
        { id: mockUser2.id, name: mockUser2.name, image: mockUser2.image },
      ],
      plants: plantsWithFertilization,
    })
  )

describe('getDelegatedTasks', () => {
  it('should return delegated plants for active delegations', async () => {
    const layer = createLayer(caretakerCurrentUser)

    const result = await Effect.runPromise(
      getDelegatedTasks.pipe(Effect.provide(layer))
    )

    expect(result).toHaveLength(2)
  })

  it('should return empty array when no active delegations', async () => {
    const layer = createLayer(caretakerCurrentUser, [], [])

    const result = await Effect.runPromise(
      getDelegatedTasks.pipe(Effect.provide(layer))
    )

    expect(result).toHaveLength(0)
  })

  it('should include plant care details (watering, health)', async () => {
    const layer = createLayer(caretakerCurrentUser)

    const result = await Effect.runPromise(
      getDelegatedTasks.pipe(Effect.provide(layer))
    )

    expect(result[0]).toHaveProperty('nextWateringAt')
    expect(result[0]).toHaveProperty('health')
    expect(result[0]).toHaveProperty('plantName')
  })

  it('should include owner name', async () => {
    const layer = createLayer(caretakerCurrentUser)

    const result = await Effect.runPromise(
      getDelegatedTasks.pipe(Effect.provide(layer))
    )

    expect(result[0]).toHaveProperty('ownerName')
    expect(result[0]?.ownerName).toBe(mockUser1.name)
  })

  it('should not include plants from completed/canceled delegations', async () => {
    const layer = createLayer(
      caretakerCurrentUser,
      [activeDelegation, completedDelegation],
      [
        { delegationId: activeDelegation.id, plantId: 'plant-1' },
        { delegationId: completedDelegation.id, plantId: 'plant-2' },
      ]
    )

    const result = await Effect.runPromise(
      getDelegatedTasks.pipe(Effect.provide(layer))
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.plantId).toBe('plant-1')
  })
})
