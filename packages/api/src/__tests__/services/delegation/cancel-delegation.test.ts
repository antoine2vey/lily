import {
  mockDelegation1,
  mockDelegationPlants,
} from '@lily/api/__tests__/fixtures/delegations'
import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { mockUser1, mockUser2 } from '@lily/api/__tests__/fixtures/users'
import { createInMemoryAbsence } from '@lily/api/__tests__/mocks/absence'
import { MockOutboxLive } from '@lily/api/__tests__/mocks/outbox'
import { createMockSqlClient } from '@lily/api/__tests__/mocks/sql-client'
import type { DelegationRow } from '@lily/api/repositories/delegation.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { cancelDelegation } from '@lily/api/services/delegation/endpoints/cancel-delegation'
import {
  DelegationInvalidStatusError,
  DelegationNotAuthorizedError,
  DelegationNotFoundError,
} from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
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

const notifications: Notification[] = []

const OuterTransactionLive = Layer.merge(createMockSqlClient(), MockOutboxLive)

const inMemory = (delegations: DelegationRow[]) =>
  createInMemoryAbsence(
    {
      delegations,
      users: [mockUser1, mockUser2],
      plantDetails: mockDelegationPlants,
      delegationPlants: [
        { delegationId: mockDelegation1.id, plantId: 'plant-1' },
        { delegationId: mockDelegation1.id, plantId: 'plant-2' },
      ],
    },
    { notifications }
  )

const createLayer = (
  currentUser: Layer.Layer<CurrentUser>,
  delegations: DelegationRow[] = [
    { ...mockDelegation1, status: 'pending' as const },
  ]
) =>
  Layer.mergeAll(currentUser, inMemory(delegations).layer, OuterTransactionLive)

describe('cancelDelegation', () => {
  it('should cancel a pending delegation', async () => {
    const layer = createLayer(ownerCurrentUser, [
      { ...mockDelegation1, status: 'pending' as const },
    ])

    const result = await Effect.runPromise(
      cancelDelegation(mockDelegation1.id).pipe(Effect.provide(layer))
    )

    expect(result.status).toBe('canceled')
  })

  it('should cancel an accepted delegation', async () => {
    const layer = createLayer(ownerCurrentUser, [
      { ...mockDelegation1, status: 'accepted' as const },
    ])

    const result = await Effect.runPromise(
      cancelDelegation(mockDelegation1.id).pipe(Effect.provide(layer))
    )

    expect(result.status).toBe('canceled')
  })

  it('should cancel an active delegation', async () => {
    const layer = createLayer(ownerCurrentUser, [
      { ...mockDelegation1, status: 'active' as const },
    ])

    const result = await Effect.runPromise(
      cancelDelegation(mockDelegation1.id).pipe(Effect.provide(layer))
    )

    expect(result.status).toBe('canceled')
  })

  it('publishes that an active delegation ended, with the plants it covered', async () => {
    const absence = inMemory([
      { ...mockDelegation1, status: 'active' as const },
    ])

    await Effect.runPromise(
      cancelDelegation(mockDelegation1.id).pipe(
        Effect.provide(
          Layer.mergeAll(ownerCurrentUser, absence.layer, OuterTransactionLive)
        )
      )
    )

    expect(absence.events).toEqual([
      {
        _tag: 'DelegationEnded',
        delegationId: mockDelegation1.id,
        ownerId: mockDelegation1.ownerId,
        caretakerId: mockDelegation1.caretakerId,
        plantIds: ['plant-1', 'plant-2'],
        reason: 'canceled',
      },
    ])
  })

  it.each(['pending', 'accepted'] as const)(
    'publishes nothing when a %s delegation is canceled',
    async (status) => {
      const absence = inMemory([{ ...mockDelegation1, status }])

      await Effect.runPromise(
        cancelDelegation(mockDelegation1.id).pipe(
          Effect.provide(
            Layer.mergeAll(
              ownerCurrentUser,
              absence.layer,
              OuterTransactionLive
            )
          )
        )
      )

      expect(absence.events).toEqual([])
    }
  )

  it('records one queued delegation_canceled for the caretaker', async () => {
    notifications.length = 0
    const layer = createLayer(ownerCurrentUser, [
      { ...mockDelegation1, status: 'accepted' as const },
    ])

    await Effect.runPromise(
      cancelDelegation(mockDelegation1.id).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      userId: mockDelegation1.caretakerId,
      type: 'delegation_canceled',
      status: 'queued',
      metadata: { delegationId: mockDelegation1.id },
    })
  })

  it('should set canceledAt timestamp', async () => {
    const layer = createLayer(ownerCurrentUser, [
      { ...mockDelegation1, status: 'pending' as const },
    ])

    const result = await Effect.runPromise(
      cancelDelegation(mockDelegation1.id).pipe(Effect.provide(layer))
    )

    expect(result.canceledAt).toBeDefined()
    expect(result.canceledAt).toBeInstanceOf(Date)
  })

  it('should fail when delegation is already completed', async () => {
    const layer = createLayer(ownerCurrentUser, [
      { ...mockDelegation1, status: 'completed' as const },
    ])

    const result = await Effect.runPromiseExit(
      cancelDelegation(mockDelegation1.id).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
    expect(failureOf(result)).toBeInstanceOf(DelegationInvalidStatusError)
  })

  it('should fail when delegation is already canceled', async () => {
    const layer = createLayer(ownerCurrentUser, [
      { ...mockDelegation1, status: 'canceled' as const },
    ])

    const result = await Effect.runPromiseExit(
      cancelDelegation(mockDelegation1.id).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
    expect(failureOf(result)).toBeInstanceOf(DelegationInvalidStatusError)
  })

  it('should fail when delegation is rejected', async () => {
    const layer = createLayer(ownerCurrentUser, [
      { ...mockDelegation1, status: 'rejected' as const },
    ])

    const result = await Effect.runPromiseExit(
      cancelDelegation(mockDelegation1.id).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
    expect(failureOf(result)).toBeInstanceOf(DelegationInvalidStatusError)
  })

  it('should fail when not the owner', async () => {
    const layer = createLayer(caretakerCurrentUser, [
      { ...mockDelegation1, status: 'pending' as const },
    ])

    const result = await Effect.runPromiseExit(
      cancelDelegation(mockDelegation1.id).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
    expect(failureOf(result)).toBeInstanceOf(DelegationNotAuthorizedError)
  })

  it('should fail when delegation not found', async () => {
    const layer = createLayer(ownerCurrentUser)

    const result = await Effect.runPromiseExit(
      cancelDelegation('non-existent').pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
    expect(failureOf(result)).toBeInstanceOf(DelegationNotFoundError)
  })

  it('should create delegation_canceled notification for caretaker on cancel', async () => {
    notifications.length = 0
    const layer = createLayer(ownerCurrentUser, [
      { ...mockDelegation1, status: 'pending' as const },
    ])

    await Effect.runPromise(
      cancelDelegation(mockDelegation1.id).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      userId: mockUser2.id,
      type: 'delegation_canceled',
      params: { senderName: mockUser1.name },
    })
  })
})
