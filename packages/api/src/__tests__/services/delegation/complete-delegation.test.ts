import {
  mockDelegation1,
  mockDelegationPlants,
} from '@lily/api/__tests__/fixtures/delegations'
import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { mockUser1, mockUser2 } from '@lily/api/__tests__/fixtures/users'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockOutbox } from '@lily/api/__tests__/mocks/outbox'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import { Dirty } from '@lily/api/contexts/reminders'
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

const activeDelegation = { ...mockDelegation1, status: 'active' as const }

const createLayer = (
  currentUser: Layer.Layer<CurrentUser>,
  delegations: DelegationRow[] = [activeDelegation],
  requested: Dirty[] = []
) =>
  Layer.mergeAll(
    MockSqlClientLive,
    currentUser,
    createMockOutbox(requested).layer,
    createMockDelegationRepository({
      delegations,
      users: [
        { id: mockUser1.id, name: mockUser1.name, image: mockUser1.image },
        { id: mockUser2.id, name: mockUser2.name, image: mockUser2.image },
      ],
      plants: mockDelegationPlants,
      delegationPlants: [
        { delegationId: mockDelegation1.id, plantId: 'plant-1' },
        { delegationId: mockDelegation1.id, plantId: 'plant-2' },
      ],
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

  it('asks Reminders to plan the handed-back plants again', async () => {
    const requested: Dirty[] = []

    await Effect.runPromise(
      completeDelegation(activeDelegation.id).pipe(
        Effect.provide(createLayer(ownerCurrentUser, undefined, requested))
      )
    )

    expect(requested).toEqual([
      Dirty.Plants({ plantIds: ['plant-1', 'plant-2'] }),
    ])
  })

  it('asks Reminders for nothing when the delegation is not active', async () => {
    const requested: Dirty[] = []

    await Effect.runPromiseExit(
      completeDelegation(mockDelegation1.id).pipe(
        Effect.provide(
          createLayer(
            ownerCurrentUser,
            [{ ...mockDelegation1, status: 'accepted' as const }],
            requested
          )
        )
      )
    )

    expect(requested).toEqual([])
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
    expect(failureOf(result)).toBeInstanceOf(DelegationNotAuthorizedError)
  })

  it('should fail when delegation is pending', async () => {
    const layer = createLayer(ownerCurrentUser, [
      { ...mockDelegation1, status: 'pending' as const },
    ])

    const result = await Effect.runPromiseExit(
      completeDelegation(mockDelegation1.id).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
    expect(failureOf(result)).toBeInstanceOf(DelegationInvalidStatusError)
  })

  it('should fail when delegation is accepted (not yet active)', async () => {
    const layer = createLayer(ownerCurrentUser, [
      { ...mockDelegation1, status: 'accepted' as const },
    ])

    const result = await Effect.runPromiseExit(
      completeDelegation(mockDelegation1.id).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
    expect(failureOf(result)).toBeInstanceOf(DelegationInvalidStatusError)
  })

  it('should fail when already completed', async () => {
    const layer = createLayer(ownerCurrentUser, [
      { ...mockDelegation1, status: 'completed' as const },
    ])

    const result = await Effect.runPromiseExit(
      completeDelegation(mockDelegation1.id).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
    expect(failureOf(result)).toBeInstanceOf(DelegationInvalidStatusError)
  })

  it('should fail when not found', async () => {
    const layer = createLayer(ownerCurrentUser)

    const result = await Effect.runPromiseExit(
      completeDelegation('non-existent').pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
    expect(failureOf(result)).toBeInstanceOf(DelegationNotFoundError)
  })
})
