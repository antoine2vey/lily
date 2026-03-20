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
import { respondToDelegation } from '@lily/api/services/delegation/endpoints/respond-delegation'
import {
  DelegationInvalidStatusError,
  DelegationNotAuthorizedError,
  DelegationNotFoundError,
} from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const caretakerCurrentUser = Layer.succeed(CurrentUser, {
  id: mockUser2.id,
  name: mockUser2.name,
  email: mockUser2.email,
  createdAt: new Date(),
  updatedAt: new Date(),
  role: 'user' as const,
  status: 'active' as const,
})

const ownerCurrentUser = Layer.succeed(CurrentUser, {
  id: mockUser1.id,
  name: mockUser1.name,
  email: mockUser1.email,
  createdAt: new Date(),
  updatedAt: new Date(),
  role: 'user' as const,
  status: 'active' as const,
})

const notifications: Notification[] = []

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

  it('should create delegation_accepted notification for owner on accept', async () => {
    notifications.length = 0
    const layer = createLayer(caretakerCurrentUser)

    await Effect.runPromise(
      respondToDelegation(pendingDelegation.id, { accept: true }).pipe(
        Effect.provide(layer)
      )
    )

    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      userId: mockUser1.id,
      type: 'delegation_accepted',
      title: '✅ Request accepted',
    })
    expect(notifications[0]?.body).toContain(mockUser2.name)
  })

  it('should create delegation_rejected notification for owner on reject', async () => {
    notifications.length = 0
    const layer = createLayer(caretakerCurrentUser)

    await Effect.runPromise(
      respondToDelegation(pendingDelegation.id, { accept: false }).pipe(
        Effect.provide(layer)
      )
    )

    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      userId: mockUser1.id,
      type: 'delegation_rejected',
      title: '😔 Request declined',
    })
    expect(notifications[0]?.body).toContain(mockUser2.name)
  })

  it('should fail with DelegationInvalidStatusError when delegation is already accepted', async () => {
    const acceptedDelegation = {
      ...pendingDelegation,
      status: 'accepted' as const,
    }
    const layer = createLayer(caretakerCurrentUser, [acceptedDelegation])

    const result = await Effect.runPromiseExit(
      respondToDelegation(acceptedDelegation.id, { accept: true }).pipe(
        Effect.provide(layer)
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
      expect(result.cause.error).toBeInstanceOf(DelegationInvalidStatusError)
    }
  })

  it('should fail with DelegationInvalidStatusError when delegation is canceled', async () => {
    const canceledDelegation = {
      ...pendingDelegation,
      status: 'canceled' as const,
    }
    const layer = createLayer(caretakerCurrentUser, [canceledDelegation])

    const result = await Effect.runPromiseExit(
      respondToDelegation(canceledDelegation.id, { accept: false }).pipe(
        Effect.provide(layer)
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
      expect(result.cause.error).toBeInstanceOf(DelegationInvalidStatusError)
    }
  })
})
