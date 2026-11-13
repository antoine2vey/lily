import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createStubCare } from '@lily/api/__tests__/mocks/care'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { DueMove } from '@lily/api/contexts/care'
import {
  type IUserRepository,
  UserRepository,
} from '@lily/api/repositories/user.repository'
import { cancelVacation } from '@lily/api/services/vacation/endpoints/cancel-vacation'
import { CARE_TYPES } from '@lily/shared'
import {
  Array,
  Cause,
  DateTime,
  Effect,
  Exit,
  Layer,
  Option,
  pipe,
  References,
} from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const NOW = new Date('2026-08-17T06:00:00.000Z')

const daysFromNow = (days: number): Date =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000)

const setup = (
  userRepository: Layer.Layer<UserRepository>,
  plants: ReturnType<typeof createTestPlant>[] = []
) => {
  const care = createStubCare()
  return {
    care,
    layer: Layer.mergeAll(
      MockSqlClientLive,
      care.layer,
      userRepository,
      createMockNotificationRepository([]),
      createMockCareScheduleRepository({ plants }),
      createMockPlantRepository({ plants }),
      createMockDelegationRepository({}),
      createMockCanopyRepository(),
      createMockCurrentUser({ id: 'user-1' })
    ),
  }
}

const run = <A, E>(effect: Effect.Effect<A, E, never>): Promise<A> =>
  Effect.runPromise(
    effect.pipe(Effect.provideService(References.MinimumLogLevel, 'None'))
  )

describe('cancelVacation', () => {
  // Only the clock is pinned: retrying a lost claim needs real timers.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should fail with VacationNotFoundError when no vacation exists', async () => {
    const user = createTestUser({ id: 'user-1' })
    const { layer } = setup(createMockUserRepository([user]))

    const error = await run(
      cancelVacation().pipe(Effect.flip, Effect.provide(layer))
    )

    expect(error._tag).toBe('VacationNotFoundError')
  })

  it('should reset a scheduled vacation without asking for any move', async () => {
    const user = createTestUser({
      id: 'user-1',
      vacationStatus: 'scheduled',
      vacationStart: daysFromNow(5),
      vacationEnd: daysFromNow(12),
    })
    const plant = createTestPlant({ id: 'plant-1', userId: 'user-1' })
    const users = [user]
    const { care, layer } = setup(createMockUserRepository(users), [plant])

    const state = await run(cancelVacation().pipe(Effect.provide(layer)))

    expect(state).toEqual({ status: 'none', startDate: null, endDate: null })
    expect(care.moved).toEqual([])
    const updated = pipe(
      Array.findFirst(users, (u) => u.id === 'user-1'),
      Option.getOrNull
    )
    expect(updated?.vacationStatus).toBe('none')
    expect(updated?.vacationStart).toBeNull()
  })

  it('should end an active vacation now, not at its stored end', async () => {
    const user = createTestUser({
      id: 'user-1',
      timezone: 'UTC',
      careReminders: true,
      vacationStatus: 'active',
      vacationStart: daysFromNow(-7),
      vacationEnd: daysFromNow(3),
    })
    const plant = createTestPlant({ id: 'plant-1', userId: 'user-1' })
    const users = [user]
    const { care, layer } = setup(createMockUserRepository(users), [plant])

    const state = await run(cancelVacation().pipe(Effect.provide(layer)))

    expect(state).toEqual({ status: 'none', startDate: null, endDate: null })
    expect(care.moved).toEqual([
      {
        reason: 'vacation',
        moves: Array.map(CARE_TYPES, (careType) => ({
          plantId: plant.id,
          careType,
          move: DueMove.AfterAbsence({
            endedAt: DateTime.makeUnsafe(NOW),
            days: 7,
          }),
        })),
      },
    ])
    const updated = pipe(
      Array.findFirst(users, (u) => u.id === 'user-1'),
      Option.getOrNull
    )
    expect(updated?.vacationStatus).toBe('none')
  })

  it('should end the vacation when the scheduler activates it between the read and the cancel', async () => {
    const user = createTestUser({
      id: 'user-1',
      timezone: 'UTC',
      careReminders: true,
      vacationStatus: 'scheduled',
      vacationStart: daysFromNow(-1),
      vacationEnd: daysFromNow(6),
    })
    const plant = createTestPlant({ id: 'plant-1', userId: 'user-1' })
    const users = [user]
    const activateOnce = Effect.sync(() => {
      if (users[0]?.vacationStatus === 'scheduled') {
        users[0] = { ...user, vacationStatus: 'active' }
      }
    })
    const racingActivation = Layer.effect(
      UserRepository,
      Effect.map(
        UserRepository,
        (repo): IUserRepository => ({
          ...repo,
          findById: (id) => repo.findById(id).pipe(Effect.tap(activateOnce)),
        })
      )
    ).pipe(Layer.provide(createMockUserRepository(users)))
    const { care, layer } = setup(racingActivation, [plant])

    const state = await run(cancelVacation().pipe(Effect.provide(layer)))

    expect(state).toEqual({ status: 'none', startDate: null, endDate: null })
    expect(users[0]?.vacationStatus).toBe('none')
    expect(
      pipe(
        Array.flatMap(care.moved, (command) => command.moves),
        Array.map((move) => move.plantId),
        Array.dedupe
      )
    ).toEqual([plant.id])
  })

  it('should die when every claim loses', async () => {
    const user = createTestUser({
      id: 'user-1',
      vacationStatus: 'scheduled',
      vacationStart: daysFromNow(5),
      vacationEnd: daysFromNow(12),
    })
    const alwaysLosing = Layer.effect(
      UserRepository,
      Effect.map(
        UserRepository,
        (repo): IUserRepository => ({
          ...repo,
          transitionVacation: () => Effect.succeed(null),
        })
      )
    ).pipe(Layer.provide(createMockUserRepository([user])))
    const { layer } = setup(alwaysLosing)

    const exit = await Effect.runPromiseExit(
      cancelVacation().pipe(
        Effect.provide(layer),
        Effect.provideService(References.MinimumLogLevel, 'None')
      )
    )

    const defect = Exit.match(exit, {
      onFailure: (cause) => Cause.squash(cause),
      onSuccess: () => null,
    })
    expect(defect).toMatchObject({
      _tag: 'VacationClaimLost',
      userId: 'user-1',
    })
  })
})
