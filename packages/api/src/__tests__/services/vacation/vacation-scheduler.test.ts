import { createTestSchedule } from '@lily/api/__tests__/fixtures/care-schedules'
import { createTestNotification } from '@lily/api/__tests__/fixtures/notifications'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import { createVacationWorld } from '@lily/api/__tests__/mocks/vacation-world'
import type { AbsenceStore, Edge } from '@lily/api/contexts/absence/store'
import { DueMove } from '@lily/api/contexts/care'
import { pollAndTransitionVacations } from '@lily/api/services/vacation-scheduler/scheduler'
import { CARE_TYPES, type User } from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import {
  Array,
  DateTime,
  Effect,
  Option,
  pipe,
  References,
  Struct,
} from 'effect'
import { SqlError, UnknownError } from 'effect/sql/SqlError'
import { describe, expect, it } from 'vitest'

const DAY_MS = 24 * 60 * 60 * 1000

const daysFromNow = (days: number): Date => new Date(Date.now() + days * DAY_MS)

const findUser = (users: User[], id: string) =>
  pipe(
    Array.findFirst(users, (u) => u.id === id),
    Option.getOrNull
  )

const run = <A>(effect: Effect.Effect<A, unknown, never>): Promise<A> =>
  Effect.runPromise(
    effect.pipe(Effect.provideService(References.MinimumLogLevel, 'None'))
  ) as Promise<A>

const BROKEN_WRITE = {
  fails: Effect.fail(
    new SqlError({
      reason: new UnknownError({
        cause: new Error('injected'),
        message: 'the write of user-a failed',
      }),
    })
  ),
  dies: Effect.die('the write of user-a broke'),
} as const

const withRacingWrite =
  (listed: Edge, afterRead: () => void) =>
  (store: AbsenceStore['Service']): AbsenceStore['Service'] => ({
    ...store,
    dueVacations: (edge, now) =>
      store
        .dueVacations(edge, now)
        .pipe(
          Effect.tap(() =>
            edge === listed ? Effect.sync(afterRead) : Effect.void
          )
        ),
  })

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

    const world = createVacationWorld({
      users,
      notifications,
      store: withRacingWrite('start', () => {
        users[0] = {
          ...user,
          vacationStatus: 'none',
          vacationStart: null,
          vacationEnd: null,
        }
      }),
    })

    const tally = await run(
      pollAndTransitionVacations.pipe(Effect.provide(world.layer))
    )

    expect(tally).toEqual({ due: 1, advanced: 0, failed: 0 })
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
    const { care, layer } = createVacationWorld({
      users,
      plants: [plant],
      store: withRacingWrite('end', () => {
        users[0] = { ...user, vacationEnd: extendedEnd }
      }),
    })

    const tally = await run(
      pollAndTransitionVacations.pipe(Effect.provide(layer))
    )

    expect(tally).toEqual({ due: 1, advanced: 0, failed: 0 })
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
    const plant = createTestPlant({ id: 'plant-due', userId: 'user-due' })
    const notifications: Notification[] = [
      createTestNotification({
        id: 'n-care',
        userId: 'user-due',
        plantId: plant.id,
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

    const world = createVacationWorld({
      users,
      notifications,
      plants: [plant],
      schedules: [
        createTestSchedule({ plantId: plant.id, nextCareAt: daysFromNow(3) }),
      ],
    })

    const tally = await run(
      pollAndTransitionVacations.pipe(Effect.provide(world.layer))
    )

    expect(tally).toEqual({ due: 1, advanced: 1, failed: 0 })
    expect(world.events).toEqual([
      { _tag: 'VacationStarted', userId: 'user-due' },
    ])
    expect(findUser(users, 'user-due')?.vacationStatus).toBe('active')
    expect(findUser(users, 'user-future')?.vacationStatus).toBe('scheduled')
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
    const { care, layer } = createVacationWorld({ users, plants: [plant] })

    await run(pollAndTransitionVacations.pipe(Effect.provide(layer)))

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

    const world = createVacationWorld({ users })

    const tally = await run(
      pollAndTransitionVacations.pipe(Effect.provide(world.layer))
    )

    expect(tally).toEqual({ due: 0, advanced: 0, failed: 0 })
    expect(world.writes).toEqual([])
    expect(findUser(users, 'user-1')?.vacationStatus).toBe('none')
  })

  it.each(Struct.keys(BROKEN_WRITE))(
    'counts a user whose write %s and still advances the next',
    async (how) => {
      const users = Array.map(['user-a', 'user-b'], (id) =>
        createTestUser({
          id,
          vacationStatus: 'scheduled',
          vacationStart: daysFromNow(-1),
          vacationEnd: daysFromNow(6),
        })
      )
      const world = createVacationWorld({
        users,
        store: (store) => ({
          ...store,
          apply: (writes) =>
            Array.some(
              writes,
              (write) =>
                write._tag === 'SetVacation' && write.userId === 'user-a'
            )
              ? BROKEN_WRITE[how]
              : store.apply(writes),
        }),
      })

      const tally = await run(
        pollAndTransitionVacations.pipe(Effect.provide(world.layer))
      )

      expect(tally).toEqual({ due: 2, advanced: 1, failed: 1 })
      expect(findUser(users, 'user-a')?.vacationStatus).toBe('scheduled')
      expect(findUser(users, 'user-b')?.vacationStatus).toBe('active')
      expect(world.events).toEqual([
        { _tag: 'VacationStarted', userId: 'user-b' },
      ])
    }
  )

  it('counts no advance for an account suspended after the tick listed it', async () => {
    const user = createTestUser({
      id: 'user-1',
      vacationStatus: 'scheduled',
      vacationStart: daysFromNow(-1),
      vacationEnd: daysFromNow(6),
    })
    const users = [user]
    const world = createVacationWorld({
      users,
      store: withRacingWrite('start', () => {
        users[0] = { ...user, status: 'suspended' }
      }),
    })

    const tally = await run(
      pollAndTransitionVacations.pipe(Effect.provide(world.layer))
    )

    expect(tally).toEqual({ due: 1, advanced: 0, failed: 0 })
    expect(users[0]?.vacationStatus).toBe('scheduled')
    expect(world.writes).toEqual([])
  })

  it('leaves the vacation of an account that is not active where it is', async () => {
    const users = [
      createTestUser({
        id: 'user-1',
        status: 'suspended',
        vacationStatus: 'scheduled',
        vacationStart: daysFromNow(-1),
        vacationEnd: daysFromNow(6),
      }),
      createTestUser({
        id: 'user-2',
        status: 'pending_deletion',
        vacationStatus: 'active',
        vacationStart: daysFromNow(-7),
        vacationEnd: daysFromNow(-1),
      }),
    ]
    const world = createVacationWorld({ users })

    const tally = await run(
      pollAndTransitionVacations.pipe(Effect.provide(world.layer))
    )

    expect(tally).toEqual({ due: 0, advanced: 0, failed: 0 })
    expect(Array.map(users, (user) => user.vacationStatus)).toEqual([
      'scheduled',
      'active',
    ])
  })

  it('starts and ends in one tick a vacation whose start and end both passed', async () => {
    const users = [
      createTestUser({
        id: 'user-1',
        timezone: 'UTC',
        vacationStatus: 'scheduled',
        vacationStart: daysFromNow(-5),
        vacationEnd: daysFromNow(-2),
      }),
    ]
    const world = createVacationWorld({ users })

    const tally = await run(
      pollAndTransitionVacations.pipe(Effect.provide(world.layer))
    )

    expect(tally).toEqual({ due: 2, advanced: 2, failed: 0 })
    expect(users[0]?.vacationStatus).toBe('none')
    expect(Array.map(world.events, (event) => event._tag)).toEqual([
      'VacationStarted',
      'VacationEnded',
    ])
  })
})
