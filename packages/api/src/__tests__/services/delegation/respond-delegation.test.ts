import {
  mockDelegation1,
  mockDelegationPlants,
} from '@lily/api/__tests__/fixtures/delegations'
import { mockUser1, mockUser2 } from '@lily/api/__tests__/fixtures/users'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import type { DelegationRow } from '@lily/api/repositories/delegation.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { respondToDelegation } from '@lily/api/services/delegation/endpoints/respond-delegation'
import {
  DelegationInvalidStatusError,
  DelegationNotAuthorizedError,
  DelegationNotFoundError,
} from '@lily/shared'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const caretakerCurrentUser = Layer.succeed(CurrentUser, {
  id: mockUser2.id,
  name: mockUser2.name,
  email: mockUser2.email,
  image: mockUser2.image,
} as any)

const ownerCurrentUser = Layer.succeed(CurrentUser, {
  id: mockUser1.id,
  name: mockUser1.name,
  email: mockUser1.email,
  image: mockUser1.image,
} as any)

const pendingDelegation = {
  ...mockDelegation1,
  status: 'pending' as const,
}

const createLayer = (
  currentUser: Layer.Layer<CurrentUser>,
  delegations: DelegationRow[] = [pendingDelegation]
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

describe('respondToDelegation', () => {
  it('should accept a pending delegation', async () => {
    const layer = createLayer(caretakerCurrentUser)

    const result = await Effect.runPromise(
      respondToDelegation(pendingDelegation.id, { accept: true }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result.status).toBe('accepted')
  })

  it('should reject a pending delegation', async () => {
    const layer = createLayer(caretakerCurrentUser)

    const result = await Effect.runPromise(
      respondToDelegation(pendingDelegation.id, { accept: false }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result.status).toBe('rejected')
  })

  it('should set respondedAt timestamp', async () => {
    const layer = createLayer(caretakerCurrentUser)

    const result = await Effect.runPromise(
      respondToDelegation(pendingDelegation.id, { accept: true }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result.respondedAt).toBeDefined()
    expect(result.respondedAt).toBeInstanceOf(Date)
  })

  it('should fail with DelegationNotFoundError when not found', async () => {
    const layer = createLayer(caretakerCurrentUser)

    const result = await Effect.runPromiseExit(
      respondToDelegation('non-existent', { accept: true }).pipe(
        Effect.provide(layer)
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
      expect(result.cause.error).toBeInstanceOf(DelegationNotFoundError)
    }
  })

  it('should fail with DelegationNotAuthorizedError when not the caretaker', async () => {
    const layer = createLayer(ownerCurrentUser)

    const result = await Effect.runPromiseExit(
      respondToDelegation(pendingDelegation.id, { accept: true }).pipe(
        Effect.provide(layer)
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
      expect(result.cause.error).toBeInstanceOf(DelegationNotAuthorizedError)
    }
  })

  it('should fail with DelegationInvalidStatusError when not pending', async () => {
    const activeDelegation = { ...pendingDelegation, status: 'active' as const }
    const layer = createLayer(caretakerCurrentUser, [activeDelegation])

    const result = await Effect.runPromiseExit(
      respondToDelegation(activeDelegation.id, { accept: true }).pipe(
        Effect.provide(layer)
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
      expect(result.cause.error).toBeInstanceOf(DelegationInvalidStatusError)
    }
  })
})
