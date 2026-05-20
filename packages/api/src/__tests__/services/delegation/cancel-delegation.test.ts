import {
  mockDelegation1,
  mockDelegationPlants,
} from '@lily/api/__tests__/fixtures/delegations'
import { mockUser1, mockUser2 } from '@lily/api/__tests__/fixtures/users'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
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

const createLayer = (
  currentUser: Layer.Layer<CurrentUser>,
  delegations: DelegationRow[] = [
    { ...mockDelegation1, status: 'pending' as const },
  ]
) =>
  Layer.mergeAll(
    currentUser,
    createMockNotificationRepository(notifications),
    createMockMessageQueue(),
    createMockUserRepository([mockUser1, mockUser2]),
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
    if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
      expect(result.cause.error).toBeInstanceOf(DelegationInvalidStatusError)
    }
  })

  it('should fail when delegation is already canceled', async () => {
    const layer = createLayer(ownerCurrentUser, [
      { ...mockDelegation1, status: 'canceled' as const },
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
      { ...mockDelegation1, status: 'rejected' as const },
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
      { ...mockDelegation1, status: 'pending' as const },
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
      title: '🚫 Delegation canceled',
    })
    expect(notifications[0]?.body).toContain(mockUser1.name)
  })
})
