import {
  mockDelegation1,
  mockDelegationPlants,
} from '@lily/api/__tests__/fixtures/delegations'
import { mockUser1, mockUser2 } from '@lily/api/__tests__/fixtures/users'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { getDelegation } from '@lily/api/services/delegation/endpoints/get-delegation'
import {
  DelegationNotAuthorizedError,
  DelegationNotFoundError,
} from '@lily/shared'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const ownerCurrentUser = Layer.succeed(CurrentUser, {
  id: mockUser1.id,
  name: mockUser1.name,
  firstName: null,
  lastName: null,
  email: mockUser1.email,
  createdAt: new Date(),
  updatedAt: new Date(),
  role: 'user' as const,
  status: 'active' as const,
})

const caretakerCurrentUser = Layer.succeed(CurrentUser, {
  id: mockUser2.id,
  name: mockUser2.name,
  firstName: null,
  lastName: null,
  email: mockUser2.email,
  createdAt: new Date(),
  updatedAt: new Date(),
  role: 'user' as const,
  status: 'active' as const,
})

const thirdPartyCurrentUser = Layer.succeed(CurrentUser, {
  id: 'user-3',
  name: 'Third Party',
  firstName: null,
  lastName: null,
  email: 'third@example.com',
  createdAt: new Date(),
  updatedAt: new Date(),
  role: 'user' as const,
  status: 'active' as const,
})

const createLayer = (currentUser: Layer.Layer<CurrentUser>) =>
  Layer.mergeAll(
    currentUser,
    createMockDelegationRepository({
      delegations: [mockDelegation1],
      delegationPlants: [
        { delegationId: mockDelegation1.id, plantId: 'plant-1' },
        { delegationId: mockDelegation1.id, plantId: 'plant-2' },
      ],
      users: [
        { id: mockUser1.id, name: mockUser1.name, image: mockUser1.image },
        { id: mockUser2.id, name: mockUser2.name, image: mockUser2.image },
      ],
      plants: mockDelegationPlants,
    })
  )

describe('getDelegation', () => {
  it('should return delegation detail for the owner', async () => {
    const layer = createLayer(ownerCurrentUser)

    const result = await Effect.runPromise(
      getDelegation(mockDelegation1.id).pipe(Effect.provide(layer))
    )

    expect(result.id).toBe(mockDelegation1.id)
    expect(result.ownerId).toBe(mockUser1.id)
  })

  it('should return delegation detail for the caretaker', async () => {
    const layer = createLayer(caretakerCurrentUser)

    const result = await Effect.runPromise(
      getDelegation(mockDelegation1.id).pipe(Effect.provide(layer))
    )

    expect(result.id).toBe(mockDelegation1.id)
  })

  it('should include plants list', async () => {
    const layer = createLayer(ownerCurrentUser)

    const result = await Effect.runPromise(
      getDelegation(mockDelegation1.id).pipe(Effect.provide(layer))
    )

    expect(result.plants).toHaveLength(2)
  })

  it('should fail with DelegationNotFoundError when not found', async () => {
    const layer = createLayer(ownerCurrentUser)

    const result = await Effect.runPromiseExit(
      getDelegation('non-existent').pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
      expect(result.cause.error).toBeInstanceOf(DelegationNotFoundError)
    }
  })

  it('should fail with DelegationNotAuthorizedError for non-participant', async () => {
    const layer = createLayer(thirdPartyCurrentUser)

    const result = await Effect.runPromiseExit(
      getDelegation(mockDelegation1.id).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
      expect(result.cause.error).toBeInstanceOf(DelegationNotAuthorizedError)
    }
  })
})
