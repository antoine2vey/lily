import {
  mockDelegation1,
  mockDelegationPlants,
} from '@lily/api/__tests__/fixtures/delegations'
import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { mockUser1, mockUser2 } from '@lily/api/__tests__/fixtures/users'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockRecipientRepository } from '@lily/api/__tests__/mocks/recipient.repository'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
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
  delegations: DelegationRow[] = [activeDelegation]
) =>
  Layer.mergeAll(
    MockSqlClientLive,
    currentUser,
    createMockNotificationRepository([]),
    createMockUserRepository([mockUser1, mockUser2]),
    createMockPlantRepository({ plants: [] }),
    createMockCareScheduleRepository(),
    createMockCanopyRepository(),
    createMockDelegationRepository({
      delegations,
      users: [
        { id: mockUser1.id, name: mockUser1.name, image: mockUser1.image },
        { id: mockUser2.id, name: mockUser2.name, image: mockUser2.image },
      ],
      plants: mockDelegationPlants,
    }),
    createMockRecipientRepository({ plants: [], delegations })
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
