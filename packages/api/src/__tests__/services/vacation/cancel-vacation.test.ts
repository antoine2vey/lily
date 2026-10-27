import { createTestSchedule } from '@lily/api/__tests__/fixtures/care-schedules'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import type { CareScheduleRow } from '@lily/api/repositories/care-schedule.repository'
import {
  type IUserRepository,
  UserRepository,
} from '@lily/api/repositories/user.repository'
import { cancelVacation } from '@lily/api/services/vacation/endpoints/cancel-vacation'
import type { User } from '@lily/shared'
import {
  Array,
  Cause,
  Effect,
  Exit,
  Layer,
  Option,
  pipe,
  References,
} from 'effect'
import { describe, expect, it } from 'vitest'

const daysFromNow = (days: number): Date =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000)

const createLayer = (
  users: User[],
  schedules: CareScheduleRow[] = [],
  plants: ReturnType<typeof createTestPlant>[] = []
) =>
  Layer.mergeAll(
    MockSqlClientLive,
    createMockUserRepository(users),
    createMockNotificationRepository([]),
    createMockCareScheduleRepository({ schedules, plants }),
    createMockDelegationRepository({}),
    createMockCanopyRepository(),
    createMockCurrentUser({ id: 'user-1' })
  )

const run = <A, E>(effect: Effect.Effect<A, E, never>): Promise<A> =>
  Effect.runPromise(
    effect.pipe(Effect.provideService(References.MinimumLogLevel, 'None'))
  )

describe('cancelVacation', () => {
  it('should fail with VacationNotFoundError when no vacation exists', async () => {
    const user = createTestUser({ id: 'user-1' })

    const error = await run(
      cancelVacation().pipe(Effect.flip, Effect.provide(createLayer([user])))
    )

    expect(error._tag).toBe('VacationNotFoundError')
  })

  it('should reset a scheduled vacation without touching schedules', async () => {
    const user = createTestUser({
      id: 'user-1',
      vacationStatus: 'scheduled',
      vacationStart: daysFromNow(5),
      vacationEnd: daysFromNow(12),
    })
    const plant = createTestPlant({ id: 'plant-1', userId: 'user-1' })
    const originalNext = daysFromNow(3)
    const schedules = [
      createTestSchedule({ plantId: plant.id, nextCareAt: originalNext }),
    ]
    const users = [user]

    const state = await run(
      cancelVacation().pipe(
        Effect.provide(createLayer(users, schedules, [plant]))
      )
    )

    expect(state).toEqual({ status: 'none', startDate: null, endDate: null })
    // No shift happened
    expect(schedules[0]?.nextCareAt).toEqual(originalNext)
    // State was reset in the repository
    const updated = pipe(
      Array.findFirst(users, (u) => u.id === 'user-1'),
      Option.getOrNull
    )
    expect(updated?.vacationStatus).toBe('none')
    expect(updated?.vacationStart).toBeNull()
  })

  it('should run the end-routine when the vacation is active (end now)', async () => {
    const user = createTestUser({
      id: 'user-1',
      timezone: 'UTC',
      careReminders: true,
      vacationStatus: 'active',
      vacationStart: daysFromNow(-7),
      vacationEnd: daysFromNow(3),
    })
    const plant = createTestPlant({ id: 'plant-1', userId: 'user-1' })
    // Fell due mid-vacation — must be moved into the future on end-now
    const schedules = [
      createTestSchedule({ plantId: plant.id, nextCareAt: daysFromNow(-3) }),
    ]
    const users = [user]

    const state = await run(
      cancelVacation().pipe(
        Effect.provide(createLayer(users, schedules, [plant]))
      )
    )

    expect(state).toEqual({ status: 'none', startDate: null, endDate: null })
    const shifted = schedules[0]?.nextCareAt
    expect(shifted).not.toBeNull()
    expect(shifted!.getTime()).toBeGreaterThan(Date.now())
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
    const schedules = [
      createTestSchedule({ plantId: plant.id, nextCareAt: daysFromNow(-1) }),
    ]
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

    const state = await run(
      cancelVacation().pipe(
        Effect.provide(
          Layer.mergeAll(
            MockSqlClientLive,
            racingActivation,
            createMockNotificationRepository([]),
            createMockCareScheduleRepository({ schedules, plants: [plant] }),
            createMockDelegationRepository({}),
            createMockCanopyRepository(),
            createMockCurrentUser({ id: 'user-1' })
          )
        )
      )
    )

    expect(state).toEqual({ status: 'none', startDate: null, endDate: null })
    expect(users[0]?.vacationStatus).toBe('none')
    expect(schedules[0]?.nextCareAt?.getTime()).toBeGreaterThan(Date.now())
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

    const exit = await Effect.runPromiseExit(
      cancelVacation().pipe(
        Effect.provide(
          Layer.mergeAll(
            MockSqlClientLive,
            alwaysLosing,
            createMockNotificationRepository([]),
            createMockCareScheduleRepository({}),
            createMockDelegationRepository({}),
            createMockCanopyRepository(),
            createMockCurrentUser({ id: 'user-1' })
          )
        ),
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
