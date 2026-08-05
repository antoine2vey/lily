import { createTestSchedule } from '@lily/api/__tests__/fixtures/care-schedules'
import { createTestNotification } from '@lily/api/__tests__/fixtures/notifications'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { pollAndTransitionVacations } from '@lily/api/services/vacation-scheduler/scheduler'
import type { User } from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import { Array, Effect, Layer, Logger, LogLevel, Option, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

const daysFromNow = (days: number): Date =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000)

const findUser = (users: User[], id: string) =>
  pipe(
    Array.findFirst(users, (u) => u.id === id),
    Option.getOrNull
  )

const run = (effect: Effect.Effect<void, unknown, never>): Promise<void> =>
  Effect.runPromise(
    effect.pipe(Logger.withMinimumLogLevel(LogLevel.None))
  ) as Promise<void>

describe('vacation-scheduler', () => {
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
            createMockUserRepository(users),
            createMockNotificationRepository(notifications),
            createMockCareScheduleRepository({}),
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

  it('should end active vacations whose end has passed, using the stored vacationEnd for the shift', async () => {
    // Vacation ran from -10d to -3d; the poll runs "late" (now). The shift
    // must use the stored end (-3d), giving a 7-day delta — not 10.
    const user = createTestUser({
      id: 'user-1',
      timezone: 'UTC',
      careReminders: true,
      vacationStatus: 'active',
      vacationStart: daysFromNow(-10),
      vacationEnd: daysFromNow(-3),
    })
    const plant = createTestPlant({ id: 'plant-1', userId: 'user-1' })
    const dueMidVacation = daysFromNow(-5)
    const schedules = [
      createTestSchedule({ plantId: plant.id, nextCareAt: dueMidVacation }),
    ]
    const users = [user]

    await run(
      pollAndTransitionVacations.pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockUserRepository(users),
            createMockNotificationRepository([]),
            createMockCareScheduleRepository({
              schedules,
              plants: [plant],
            }),
            createMockDelegationRepository({})
          )
        )
      )
    )

    expect(findUser(users, 'user-1')?.vacationStatus).toBe('none')
    const shifted = schedules[0]?.nextCareAt
    expect(shifted).not.toBeNull()
    // Shifted by the 7-day vacation length (whole local days, UTC tz here),
    // then clamped to no earlier than the day after the stored end.
    const sevenDayShift = dueMidVacation.getTime() + 7 * 24 * 60 * 60 * 1000
    expect(shifted!.getTime()).toBeGreaterThanOrEqual(sevenDayShift)
    // Well below a 10-day (poll-time) shift
    expect(shifted!.getTime()).toBeLessThan(
      dueMidVacation.getTime() + 10 * 24 * 60 * 60 * 1000
    )
  })

  it('should do nothing when no vacations are due', async () => {
    const user = createTestUser({ id: 'user-1' })
    const users = [user]

    await run(
      pollAndTransitionVacations.pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockUserRepository(users),
            createMockNotificationRepository([]),
            createMockCareScheduleRepository({}),
            createMockDelegationRepository({})
          )
        )
      )
    )

    expect(findUser(users, 'user-1')?.vacationStatus).toBe('none')
  })
})
