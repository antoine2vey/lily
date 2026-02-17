import {
  mockDelegation1,
  mockDelegationPlants,
} from '@lily/api/__tests__/fixtures/delegations'
import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { mockUser1, mockUser2 } from '@lily/api/__tests__/fixtures/users'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import type { DelegationRow } from '@lily/api/repositories/delegation.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { createDelegation } from '@lily/api/services/delegation/endpoints/create-delegation'
import {
  CannotDelegateSelfError,
  DelegationDateError,
  DelegationOverlapError,
  LimitExceededError,
  UserNotFoundError,
} from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
const futureEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)

const mockCurrentUser = Layer.succeed(CurrentUser, {
  id: mockUser1.id,
  name: mockUser1.name,
  email: mockUser1.email,
  createdAt: new Date(),
  updatedAt: new Date(),
  role: 'user' as const,
  status: 'active' as const,
})

const notifications: Notification[] = []

const validRequest = {
  caretakerId: mockUser2.id,
  plantIds: ['plant-1', 'plant-2'],
  startDate: futureStart.toISOString(),
  endDate: futureEnd.toISOString(),
  message: 'Please water my plants',
}

const createLayer = (options?: {
  delegationAccessDenied?: boolean | undefined
  delegations?: DelegationRow[] | undefined
  delegationPlants?: { delegationId: string; plantId: string }[] | undefined
}) =>
  Layer.mergeAll(
    mockCurrentUser,
    createMockLimitChecker({
      delegationAccessDenied: options?.delegationAccessDenied,
    }),
    createMockUserRepository([mockUser1, mockUser2]),
    createMockPlantRepository({ plants: mockPlants }),
    createMockNotificationRepository(notifications),
    createMockDelegationRepository({
      delegations: options?.delegations ?? [],
      delegationPlants: options?.delegationPlants ?? [],
      users: [
        {
          id: mockUser1.id,
          name: mockUser1.name,
          image: mockUser1.image,
        },
        {
          id: mockUser2.id,
          name: mockUser2.name,
          image: mockUser2.image,
        },
      ],
      plants: mockDelegationPlants,
    })
  )

describe('createDelegation', () => {
  it('should create a delegation with valid data', async () => {
    const layer = createLayer()

    const result = await Effect.runPromise(
      createDelegation(validRequest).pipe(Effect.provide(layer))
    )

    expect(result).toBeDefined()
    expect(result.ownerId).toBe(mockUser1.id)
    expect(result.caretakerId).toBe(mockUser2.id)
    expect(result.status).toBe('pending')
    expect(result.message).toBe('Please water my plants')
  })

  it('should set status to pending', async () => {
    const layer = createLayer()

    const result = await Effect.runPromise(
      createDelegation(validRequest).pipe(Effect.provide(layer))
    )

    expect(result.status).toBe('pending')
  })

  it('should link specified plants to the delegation', async () => {
    const layer = createLayer()

    const result = await Effect.runPromise(
      createDelegation(validRequest).pipe(Effect.provide(layer))
    )

    expect(result.plants).toHaveLength(2)
  })

  it('should fail with LimitExceededError for free tier users', async () => {
    const layer = createLayer({ delegationAccessDenied: true })

    const result = await Effect.runPromiseExit(
      createDelegation(validRequest).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
      expect(result.cause.error).toBeInstanceOf(LimitExceededError)
      expect((result.cause.error as LimitExceededError).feature).toBe(
        'care_delegation'
      )
    }
  })

  it('should fail with CannotDelegateSelfError when delegating to self', async () => {
    const layer = createLayer()

    const result = await Effect.runPromiseExit(
      createDelegation({
        ...validRequest,
        caretakerId: mockUser1.id,
      }).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
      expect(result.cause.error).toBeInstanceOf(CannotDelegateSelfError)
    }
  })

  it('should fail with UserNotFoundError when caretaker does not exist', async () => {
    const layer = createLayer()

    const result = await Effect.runPromiseExit(
      createDelegation({
        ...validRequest,
        caretakerId: 'non-existent-user',
      }).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
      expect(result.cause.error).toBeInstanceOf(UserNotFoundError)
    }
  })

  it('should fail with DelegationDateError when start date is in the past', async () => {
    const layer = createLayer()
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const result = await Effect.runPromiseExit(
      createDelegation({
        ...validRequest,
        startDate: pastDate.toISOString(),
      }).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
      expect(result.cause.error).toBeInstanceOf(DelegationDateError)
      expect((result.cause.error as DelegationDateError).message).toContain(
        'future'
      )
    }
  })

  it('should fail with DelegationDateError when end date is before start date', async () => {
    const layer = createLayer()

    const result = await Effect.runPromiseExit(
      createDelegation({
        ...validRequest,
        startDate: futureEnd.toISOString(),
        endDate: futureStart.toISOString(),
      }).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
      expect(result.cause.error).toBeInstanceOf(DelegationDateError)
      expect((result.cause.error as DelegationDateError).message).toContain(
        'after start date'
      )
    }
  })

  it('should fail with DelegationOverlapError when plants have existing delegation', async () => {
    const existingDelegation = {
      ...mockDelegation1,
      startDate: futureStart,
      endDate: futureEnd,
      status: 'active' as const,
    }

    const layer = createLayer({
      delegations: [existingDelegation],
      delegationPlants: [
        { delegationId: existingDelegation.id, plantId: 'plant-1' },
      ],
    })

    const result = await Effect.runPromiseExit(
      createDelegation(validRequest).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
      expect(result.cause.error).toBeInstanceOf(DelegationOverlapError)
    }
  })

  it('should create delegation_request notification for caretaker on creation', async () => {
    notifications.length = 0
    const layer = createLayer()

    await Effect.runPromise(
      createDelegation(validRequest).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      userId: mockUser2.id,
      type: 'delegation_request',
      title: 'Care request',
    })
    expect(notifications[0]?.body).toContain(mockUser1.name)
  })
})
