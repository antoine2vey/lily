import { mockCanopyId } from '@lily/api/__tests__/fixtures/canopies'
import {
  mockDelegation1,
  mockDelegationPlants,
} from '@lily/api/__tests__/fixtures/delegations'
import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import {
  createTestPlant,
  mockPlants,
} from '@lily/api/__tests__/fixtures/plants'
import { mockUser1, mockUser2 } from '@lily/api/__tests__/fixtures/users'
import { createInMemoryAbsence } from '@lily/api/__tests__/mocks/absence'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { MockOutboxLive } from '@lily/api/__tests__/mocks/outbox'
import { createOutboxTimeline } from '@lily/api/__tests__/mocks/outbox-timeline'
import { createMockSqlClient } from '@lily/api/__tests__/mocks/sql-client'
import type { DelegationRow } from '@lily/api/repositories/delegation.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { createDelegation } from '@lily/api/services/delegation/endpoints/create-delegation'
import {
  CannotDelegateSelfError,
  CanopyPlantNotDelegableError,
  DelegationDateError,
  DelegationOverlapError,
  LimitExceededError,
  UserNotFoundError,
} from '@lily/shared'
import { PlantNotAuthorizedError } from '@lily/shared/errors/plant'
import type { Notification } from '@lily/shared/notification'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
const futureEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)

const mockCurrentUser = Layer.succeed(CurrentUser, {
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

const notifications: Notification[] = []

const validRequest = {
  caretakerId: mockUser2.id,
  plantIds: ['plant-1', 'plant-2'],
  startDate: futureStart.toISOString(),
  endDate: futureEnd.toISOString(),
  message: 'Please water my plants',
}

const canopyPlant = createTestPlant({
  id: 'canopy-plant',
  userId: null,
  canopyId: mockCanopyId,
  createdByUserId: mockUser2.id,
})

const createLayer = (options?: {
  canopyMember?: boolean | undefined
  delegationAccessDenied?: boolean | undefined
  delegations?: DelegationRow[] | undefined
  delegationPlants?: { delegationId: string; plantId: string }[] | undefined
  timeline?: ReturnType<typeof createOutboxTimeline> | undefined
}) =>
  Layer.mergeAll(
    mockCurrentUser,
    createMockLimitChecker({
      delegationAccessDenied: options?.delegationAccessDenied,
    }),
    createInMemoryAbsence(
      {
        delegations: options?.delegations ?? [],
        delegationPlants: options?.delegationPlants ?? [],
        users: [mockUser1, mockUser2],
        plants: [...mockPlants, canopyPlant],
        plantDetails: mockDelegationPlants,
        memberships: options?.canopyMember
          ? [{ userId: mockUser1.id, canopyId: mockCanopyId }]
          : [],
      },
      { notifications, timeline: options?.timeline }
    ).layer,
    options?.timeline?.sql ?? createMockSqlClient(),
    MockOutboxLive
  )

describe('createDelegation', () => {
  it('refuses a Canopy plant to a member who can see it', async () => {
    const exit = await Effect.runPromiseExit(
      createDelegation({
        ...validRequest,
        plantIds: ['plant-1', 'canopy-plant'],
      }).pipe(Effect.provide(createLayer({ canopyMember: true })))
    )
    expect(failureOf(exit)).toEqual(
      new CanopyPlantNotDelegableError({ plantId: 'canopy-plant' })
    )
  })

  it('answers a Canopy plant the caller cannot see like any foreign plant', async () => {
    const exit = await Effect.runPromiseExit(
      createDelegation({
        ...validRequest,
        plantIds: ['plant-1', 'canopy-plant'],
      }).pipe(Effect.provide(createLayer()))
    )
    expect(failureOf(exit)).toEqual(new PlantNotAuthorizedError())
  })

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
    expect(failureOf(result)).toBeInstanceOf(LimitExceededError)
    expect((failureOf(result) as LimitExceededError).feature).toBe(
      'care_delegation'
    )
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
    expect(failureOf(result)).toBeInstanceOf(CannotDelegateSelfError)
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
    expect(failureOf(result)).toBeInstanceOf(UserNotFoundError)
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
    expect(failureOf(result)).toBeInstanceOf(DelegationDateError)
    expect((failureOf(result) as DelegationDateError).message).toContain(
      'future'
    )
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
    expect(failureOf(result)).toBeInstanceOf(DelegationDateError)
    expect((failureOf(result) as DelegationDateError).message).toContain(
      'after start date'
    )
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
    expect(failureOf(result)).toBeInstanceOf(DelegationOverlapError)
  })

  it('should create delegation_request notification for caretaker on creation', async () => {
    notifications.length = 0
    const timeline = createOutboxTimeline()
    const layer = createLayer({ timeline })

    const delegation = await Effect.runPromise(
      createDelegation(validRequest).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      userId: mockUser2.id,
      type: 'delegation_request',
      status: 'queued',
      params: { senderName: mockUser1.name },
    })
    expect(notifications[0]?.metadata).toEqual({
      delegationId: delegation.id,
    })
    expect(timeline.events).toEqual([
      'begin',
      `insert delegation_request ${mockUser2.id}`,
      'commit',
      `enqueue delegation_request ${mockUser2.id}`,
    ])
  })

  it('should fail with PlantNotAuthorizedError when plantId does not exist', async () => {
    const layer = createLayer()

    const result = await Effect.runPromiseExit(
      createDelegation({
        ...validRequest,
        plantIds: ['non-existent-plant'],
      }).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
    expect(failureOf(result)).toBeInstanceOf(PlantNotAuthorizedError)
  })

  it('should fail with PlantNotAuthorizedError when plant belongs to another user', async () => {
    const layer = createLayer()

    // plant-3 belongs to user-2, current user is user-1
    const result = await Effect.runPromiseExit(
      createDelegation({
        ...validRequest,
        plantIds: ['plant-1', 'plant-3'],
      }).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
    expect(failureOf(result)).toBeInstanceOf(PlantNotAuthorizedError)
  })

  it('should fail with DelegationDateError when plantIds is empty', async () => {
    const layer = createLayer()

    const result = await Effect.runPromiseExit(
      createDelegation({
        ...validRequest,
        plantIds: [],
      }).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(result)).toBe(true)
    expect(failureOf(result)).toBeInstanceOf(DelegationDateError)
  })

  it('answers a caller whose account is gone like a caller who owns none of the plants', async () => {
    const result = await Effect.runPromiseExit(
      createDelegation(validRequest).pipe(
        Effect.provide(
          Layer.mergeAll(
            createLayer(),
            Layer.succeed(CurrentUser, {
              id: 'gone',
              name: null,
              firstName: null,
              lastName: null,
              email: 'gone@example.com',
              createdAt: new Date(),
              updatedAt: new Date(),
              role: 'user' as const,
              status: 'active' as const,
            })
          )
        )
      )
    )

    expect(failureOf(result)).toEqual(new PlantNotAuthorizedError())
  })

  it('answers a date it cannot read as a date error', async () => {
    const result = await Effect.runPromiseExit(
      createDelegation({ ...validRequest, startDate: 'next tuesday' }).pipe(
        Effect.provide(createLayer())
      )
    )

    expect(failureOf(result)).toEqual(
      new DelegationDateError({ message: 'Invalid date format' })
    )
  })

  it('writes nothing and tells nobody when it refuses', async () => {
    notifications.length = 0
    const delegations: DelegationRow[] = []

    await Effect.runPromiseExit(
      createDelegation({
        ...validRequest,
        plantIds: ['plant-1', 'plant-3'],
      }).pipe(Effect.provide(createLayer({ delegations })))
    )

    expect(delegations).toEqual([])
    expect(notifications).toEqual([])
  })
})
