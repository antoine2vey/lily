import {
  mockDelegation1,
  mockDelegationPlants,
} from '@lily/api/__tests__/fixtures/delegations'
import { mockUser1, mockUser2 } from '@lily/api/__tests__/fixtures/users'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { cancelDelegation } from '@lily/api/services/delegation/endpoints/cancel-delegation'
import {
  DelegationInvalidStatusError,
  DelegationNotAuthorizedError,
  DelegationNotFoundError,
} from '@lily/shared'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

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

const createLayer = (
  currentUser: Layer.Layer<CurrentUser>,
  delegations = [{ ...mockDelegation1, status: 'pending' }]
) =>
  Layer.mergeAll(
    currentUser,
    createMockDelegationRepository({
      delegations,
      users: [
        { id: mockUser1.id, name: mockUser1.name, image: mockUser1.image },
        { id: mockUser2.id, name: mockUser2.name, image: mockUser2.image },
      ],
      plants: mockDelegationPlants,
    })
  )

describe('cancelDelegation', () => {
  it('should cancel a pending delegation', async () => {
    const layer = createLayer(ownerCurrentUser, [
      { ...mockDelegation1, status: 'pending' },
    ])

    const result = await Effect.runPromise(
      cancelDelegation(mockDelegation1.id).pipe(Effect.provide(layer))
    )

    expect(result.status).toBe('canceled')
  })

  it('should cancel an accepted delegation', async () => {
    const layer = createLayer(ownerCurrentUser, [
      { ...mockDelegation1, status: 'accepted' },
    ])

    const result = await Effect.runPromise(
      cancelDelegation(mockDelegation1.id).pipe(Effect.provide(layer))
    )

    expect(result.status).toBe('canceled')
  })

  it('should cancel an active delegation', async () => {
    const layer = createLayer(ownerCurrentUser, [
      { ...mockDelegation1, status: 'active' },
    ])

    const result = await Effect.runPromise(
      cancelDelegation(mockDelegation1.id).pipe(Effect.provide(layer))
    )

    expect(result.status).toBe('canceled')
  })

  it('should set canceledAt timestamp', async () => {
    const layer = createLayer(ownerCurrentUser, [
      { ...mockDelegation1, status: 'pending' },
    ])

    const result = await Effect.runPromise(
      cancelDelegation(mockDelegation1.id).pipe(Effect.provide(layer))
    )

    expect(result.canceledAt).toBeDefined()
    expect(result.canceledAt).toBeInstanceOf(Date)
  })

  it('should fail when delegation is already completed', async () => {
    const layer = createLayer(ownerCurrentUser, [
      { ...mockDelegation1, status: 'completed' },
    ])

    const result = await Effect.runPromiseExit(
      cancelDelegation(mockDelegation1.id).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
      expect(result.cause.error).toBeInstanceOf(DelegationInvalidStatusError)
    }
  })

  it('should fail when delegation is already canceled', async () => {
    const layer = createLayer(ownerCurrentUser, [
      { ...mockDelegation1, status: 'canceled' },
    ])

    const result = await Effect.runPromiseExit(
      cancelDelegation(mockDelegation1.id).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
      expect(result.cause.error).toBeInstanceOf(DelegationInvalidStatusError)
    }
  })

  it('should fail when delegation is rejected', async () => {
    const layer = createLayer(ownerCurrentUser, [
      { ...mockDelegation1, status: 'rejected' },
    ])

    const result = await Effect.runPromiseExit(
      cancelDelegation(mockDelegation1.id).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
      expect(result.cause.error).toBeInstanceOf(DelegationInvalidStatusError)
    }
  })

  it('should fail when not the owner', async () => {
    const layer = createLayer(caretakerCurrentUser, [
      { ...mockDelegation1, status: 'pending' },
    ])

    const result = await Effect.runPromiseExit(
      cancelDelegation(mockDelegation1.id).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
      expect(result.cause.error).toBeInstanceOf(DelegationNotAuthorizedError)
    }
  })

  it('should fail when delegation not found', async () => {
    const layer = createLayer(ownerCurrentUser)

    const result = await Effect.runPromiseExit(
      cancelDelegation('non-existent').pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
      expect(result.cause.error).toBeInstanceOf(DelegationNotFoundError)
    }
  })
})
