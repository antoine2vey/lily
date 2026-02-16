import {
  mockDelegation1,
  mockDelegation2,
  mockDelegationPlants,
} from '@lily/api/__tests__/fixtures/delegations'
import { mockUser1, mockUser2 } from '@lily/api/__tests__/fixtures/users'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { getMyDelegations } from '@lily/api/services/delegation/endpoints/get-my-delegations'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const mockUser3 = {
  id: 'user-3',
  name: 'Third User',
  image: null,
}

const ownerCurrentUser = Layer.succeed(CurrentUser, {
  id: mockUser1.id,
  name: mockUser1.name,
  email: mockUser1.email,
  image: mockUser1.image,
} as any)

const caretakerCurrentUser = Layer.succeed(CurrentUser, {
  id: mockUser2.id,
  name: mockUser2.name,
  email: mockUser2.email,
  image: mockUser2.image,
} as any)

const delegationAsCaretaker = {
  ...mockDelegation1,
  id: 'delegation-ct',
  ownerId: mockUser3.id,
  caretakerId: mockUser1.id,
  status: 'active',
}

const createLayer = (
  currentUser: Layer.Layer<CurrentUser>,
  delegations = [mockDelegation1, mockDelegation2, delegationAsCaretaker]
) =>
  Layer.mergeAll(
    currentUser,
    createMockDelegationRepository({
      delegations,
      delegationPlants: [
        { delegationId: mockDelegation1.id, plantId: 'plant-1' },
        { delegationId: mockDelegation2.id, plantId: 'plant-2' },
      ],
      users: [
        { id: mockUser1.id, name: mockUser1.name, image: mockUser1.image },
        { id: mockUser2.id, name: mockUser2.name, image: mockUser2.image },
        mockUser3,
      ],
      plants: mockDelegationPlants,
    })
  )

describe('getMyDelegations', () => {
  it('should return delegations where user is owner', async () => {
    const layer = createLayer(ownerCurrentUser)

    const result = await Effect.runPromise(
      getMyDelegations({ role: 'owner' }).pipe(Effect.provide(layer))
    )

    expect(result.items.length).toBeGreaterThanOrEqual(2)
  })

  it('should return delegations where user is caretaker', async () => {
    const layer = createLayer(ownerCurrentUser)

    const result = await Effect.runPromise(
      getMyDelegations({ role: 'caretaker' }).pipe(Effect.provide(layer))
    )

    expect(result.items.length).toBeGreaterThanOrEqual(1)
  })

  it('should return both roles by default', async () => {
    const layer = createLayer(ownerCurrentUser)

    const result = await Effect.runPromise(
      getMyDelegations({}).pipe(Effect.provide(layer))
    )

    expect(result.items.length).toBeGreaterThanOrEqual(3)
  })

  it('should filter by status', async () => {
    const layer = createLayer(ownerCurrentUser)

    const result = await Effect.runPromise(
      getMyDelegations({ status: 'pending' }).pipe(Effect.provide(layer))
    )

    expect(result.items.length).toBeGreaterThanOrEqual(1)
    expect(result.items.every((i) => i.status === 'pending')).toBe(true)
  })

  it('should return paginated results', async () => {
    const layer = createLayer(ownerCurrentUser)

    const result = await Effect.runPromise(
      getMyDelegations({ page: '1', limit: '1' }).pipe(Effect.provide(layer))
    )

    expect(result.items).toHaveLength(1)
    expect(result.hasMore).toBe(true)
    expect(result.total).toBeGreaterThan(1)
  })

  it('should include plantCount for each delegation', async () => {
    const layer = createLayer(ownerCurrentUser)

    const result = await Effect.runPromise(
      getMyDelegations({ role: 'owner' }).pipe(Effect.provide(layer))
    )

    expect(result.items.every((i) => typeof i.plantCount === 'number')).toBe(
      true
    )
  })
})
