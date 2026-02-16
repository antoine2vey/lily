import {
  mockDelegation1,
  mockDelegationPlants,
} from '@lily/api/__tests__/fixtures/delegations'
import { mockUser1, mockUser2 } from '@lily/api/__tests__/fixtures/users'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import type { DelegationRow } from '@lily/api/repositories/delegation.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { completeDelegation } from '@lily/api/services/delegation/endpoints/complete-delegation'
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

const activeDelegation = { ...mockDelegation1, status: 'active' as const }

const createLayer = (
  currentUser: Layer.Layer<CurrentUser>,
  delegations: DelegationRow[] = [activeDelegation]
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

describe('completeDelegation', () => {
  it('should complete an active delegation early', async () => {
    const layer = createLayer(ownerCurrentUser)

    const result = await Effect.runPromise(
      completeDelegation(activeDelegation.id).pipe(Effect.provide(layer))
    )

    expect(result.status).toBe('completed')
  })

  it('should set completedAt timestamp', async () => {
    const layer = createLayer(ownerCurrentUser)

    const result = await Effect.runPromise(
      completeDelegation(activeDelegation.id).pipe(Effect.provide(layer))
    )

    expect(result.completedAt).toBeDefined()
    expect(result.completedAt).toBeInstanceOf(Date)
  })

  it('should fail when not the owner', async () => {
    const layer = createLayer(caretakerCurrentUser)

    const result = await Effect.runPromiseExit(
      completeDelegation(activeDelegation.id).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
      expect(result.cause.error).toBeInstanceOf(DelegationNotAuthorizedError)
    }
  })

  it('should fail when delegation is pending', async () => {
    const layer = createLayer(ownerCurrentUser, [
      { ...mockDelegation1, status: 'pending' as const },
    ])

    const result = await Effect.runPromiseExit(
      completeDelegation(mockDelegation1.id).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
      expect(result.cause.error).toBeInstanceOf(DelegationInvalidStatusError)
    }
  })

  it('should fail when delegation is accepted (not yet active)', async () => {
    const layer = createLayer(ownerCurrentUser, [
      { ...mockDelegation1, status: 'accepted' as const },
    ])

    const result = await Effect.runPromiseExit(
      completeDelegation(mockDelegation1.id).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
      expect(result.cause.error).toBeInstanceOf(DelegationInvalidStatusError)
    }
  })

  it('should fail when already completed', async () => {
    const layer = createLayer(ownerCurrentUser, [
      { ...mockDelegation1, status: 'completed' as const },
    ])

    const result = await Effect.runPromiseExit(
      completeDelegation(mockDelegation1.id).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
      expect(result.cause.error).toBeInstanceOf(DelegationInvalidStatusError)
    }
  })

  it('should fail when not found', async () => {
    const layer = createLayer(ownerCurrentUser)

    const result = await Effect.runPromiseExit(
      completeDelegation('non-existent').pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
      expect(result.cause.error).toBeInstanceOf(DelegationNotFoundError)
    }
  })
})
