import { createTestNotification } from '@lily/api/__tests__/fixtures/notifications'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createStubCare } from '@lily/api/__tests__/mocks/care'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { DueMove } from '@lily/api/contexts/care'
import {
  type IUserRepository,
  UserRepository,
} from '@lily/api/repositories/user.repository'
import { pollAndTransitionVacations } from '@lily/api/services/vacation-scheduler/scheduler'
import { CARE_TYPES, type User } from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import {
  Array,
  DateTime,
  Effect,
  Layer,
  Option,
  pipe,
  References,
} from 'effect'
import { describe, expect, it } from 'vitest'

const DAY_MS = 24 * 60 * 60 * 1000

const daysFromNow = (days: number): Date => new Date(Date.now() + days * DAY_MS)

const findUser = (users: User[], id: string) =>
  pipe(
    Array.findFirst(users, (u) => u.id === id),
    Option.getOrNull
  )

const run = (effect: Effect.Effect<void, unknown, never>): Promise<void> =>
  Effect.runPromise(
    effect.pipe(Effect.provideService(References.MinimumLogLevel, 'None'))
  ) as Promise<void>

const withRacingWrite = (
  users: User[],
  poll: 'findVacationsToActivate' | 'findVacationsToEnd',
  afterRead: () => void
) =>
  Layer.effect(
    UserRepository,
    Effect.map(
      UserRepository,
      (repo): IUserRepository => ({
        ...repo,
        [poll]: (now: Date) =>
          repo[poll](now).pipe(Effect.tap(() => Effect.sync(afterRead))),
      })
    )
  ).pipe(Layer.provide(createMockUserRepository(users)))

describe('vacation-scheduler', () => {
  it('leaves a vacation canceled between the read and the activation alone', async () => {
    const user = createTestUser({
      id: 'user-1',
      vacationStatus: 'scheduled',
      vacationStart: daysFromNow(-1),
      vacationEnd: daysFromNow(6),
    })
    const users = [user]
    const notifications: Notification[] = [
      createTestNotification({
        id: 'n-care',
        userId: 'user-1',
        type: 'watering_reminder',
        status: 'pending',
      }),
    ]

    await run(
      pollAndTransitionVacations.pipe(
        Effect.provide(
          Layer.mergeAll(
            MockSqlClientLive,
            createStubCare().layer,
            withRacingWrite(users, 'findVacationsToActivate', () => {
              users[0] = {
                ...user,
                vacationStatus: 'none',
                vacationStart: null,
                vacationEnd: null,
              }
            }),
            createMockNotificationRepository(notifications),
            createMockCareScheduleRepository({}),
            createMockPlantRepository({ plants: [] }),
            createMockCanopyRepository(),
            createMockDelegationRepository({})
          )
        )
      )
    )

    const after = findUser(users, 'user-1')
    expect(after?.vacationStatus).toBe('none')
    expect(after?.vacationEnd).toBeNull()
    expect(Array.map(notifications, (n) => n.id)).toEqual(['n-care'])
  })

  it('leaves a vacation extended between the read and the end alone', async () => {
    const user = createTestUser({
      id: 'user-1',
      vacationStatus: 'active',
      vacationStart: daysFromNow(-7),
      vacationEnd: daysFromNow(-1),
    })
    const extendedEnd = daysFromNow(5)
    const users = [user]
    const plant = createTestPlant({ id: 'plant-1', userId: 'user-1' })
    const care = createStubCare()

    await run(
      pollAndTransitionVacations.pipe(
        Effect.provide(
          Layer.mergeAll(
            MockSqlClientLive,
            care.layer,
            withRacingWrite(users, 'findVacationsToEnd', () => {
              users[0] = { ...user, vacationEnd: extendedEnd }
            }),
            createMockNotificationRepository([]),
            createMockCareScheduleRepository({ plants: [plant] }),
            createMockPlantRepository({ plants: [plant] }),
            createMockCanopyRepository(),
            createMockDelegationRepository({})
          )
        )
      )
    )

    const after = findUser(users, 'user-1')
    expect(after?.vacationStatus).toBe('active')
    expect(after?.vacationEnd).toEqual(extendedEnd)
    expect(care.moved).toEqual([])
  })

  it('should activate scheduled vacations whose start has passed and clean muted pending rows', async () => {
    const dueUser = createTestUser({
      id: 'user-due',
      vacationStatus: 'scheduled',
      vacationStart: daysFromNow(-1),
      vacationEnd: daysFromNow(6),
    })
    const futureUser = createTestUser({
      id: 'user-future',
      vacationStatus: 'scheduled',
      vacationStart: daysFromNow(3),
      vacationEnd: daysFromNow(10),
    })
    const users = [dueUser, futureUser]
    const notifications: Notification[] = [
      createTestNotification({
        id: 'n-care',
        userId: 'user-due',
        type: 'watering_reminder',
        status: 'pending',
      }),
      createTestNotification({
        id: 'n-social',
        userId: 'user-due',
        type: 'new_follower',
        status: 'pending',
      }),
    ]

    await run(
      pollAndTransitionVacations.pipe(
        Effect.provide(
          Layer.mergeAll(
            MockSqlClientLive,
            createStubCare().layer,
            createMockUserRepository(users),
            createMockNotificationRepository(notifications),
            createMockCareScheduleRepository({}),
            createMockPlantRepository({ plants: [] }),
            createMockCanopyRepository(),
            createMockDelegationRepository({})
          )
        )
      )
    )

    expect(findUser(users, 'user-due')?.vacationStatus).toBe('active')
    expect(findUser(users, 'user-future')?.vacationStatus).toBe('scheduled')
    // Muted care row deleted, social row kept
    expect(Array.map(notifications, (n) => n.id)).toEqual(['n-social'])
  })

  it('should end active vacations whose end has passed, counting the days away up to the stored vacationEnd', async () => {
    const vacationEnd = daysFromNow(-3)
    const user = createTestUser({
      id: 'user-1',
      timezone: 'UTC',
      careReminders: true,
      vacationStatus: 'active',
      vacationStart: new Date(vacationEnd.getTime() - 7 * DAY_MS),
      vacationEnd,
    })
    const plant = createTestPlant({ id: 'plant-1', userId: 'user-1' })
    const users = [user]
    const care = createStubCare()

    await run(
      pollAndTransitionVacations.pipe(
        Effect.provide(
          Layer.mergeAll(
            MockSqlClientLive,
            care.layer,
            createMockUserRepository(users),
            createMockNotificationRepository([]),
            createMockCareScheduleRepository({ plants: [plant] }),
            createMockPlantRepository({ plants: [plant] }),
            createMockCanopyRepository(),
            createMockDelegationRepository({})
          )
        )
      )
    )

    expect(findUser(users, 'user-1')?.vacationStatus).toBe('none')
    expect(care.moved).toEqual([
      {
        reason: 'vacation',
        moves: Array.map(CARE_TYPES, (careType) => ({
          plantId: plant.id,
          careType,
          move: DueMove.AfterAbsence({
            endedAt: DateTime.makeUnsafe(vacationEnd),
            days: 7,
          }),
        })),
      },
    ])
  })

  it('should do nothing when no vacations are due', async () => {
    const user = createTestUser({ id: 'user-1' })
    const users = [user]

    await run(
      pollAndTransitionVacations.pipe(
        Effect.provide(
          Layer.mergeAll(
            MockSqlClientLive,
            createStubCare().layer,
            createMockUserRepository(users),
            createMockNotificationRepository([]),
            createMockCareScheduleRepository({}),
            createMockPlantRepository({ plants: [] }),
            createMockCanopyRepository(),
            createMockDelegationRepository({})
          )
        )
      )
    )

    expect(findUser(users, 'user-1')?.vacationStatus).toBe('none')
  })
})
