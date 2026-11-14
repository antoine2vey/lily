import { createTestSchedule } from '@lily/api/__tests__/fixtures/care-schedules'
import { createTestNotification } from '@lily/api/__tests__/fixtures/notifications'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import { createVacationWorld } from '@lily/api/__tests__/mocks/vacation-world'
import type { AbsenceStore } from '@lily/api/contexts/absence/store'
import { setVacation } from '@lily/api/services/vacation/endpoints/set-vacation'
import type { User } from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import { Array, Effect, Order, pipe, References } from 'effect'
import { describe, expect, it } from 'vitest'

const daysFromNow = (days: number): Date =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000)

const plant = createTestPlant({ id: 'plant-1', userId: 'user-1' })

const worldOf = (
  users: User[],
  notifications: Notification[] = [],
  currentUserId = 'user-1',
  store?: (store: AbsenceStore['Service']) => AbsenceStore['Service']
) =>
  createVacationWorld({
    users,
    notifications,
    currentUserId,
    store,
    plants: [plant],
    schedules: [
      createTestSchedule({ plantId: plant.id, nextCareAt: daysFromNow(3) }),
    ],
  })

const createLayer = (
  users: User[],
  notifications: Notification[] = [],
  currentUserId = 'user-1'
) => worldOf(users, notifications, currentUserId).layer

const run = <A, E>(effect: Effect.Effect<A, E, never>): Promise<A> =>
  Effect.runPromise(
    effect.pipe(Effect.provideService(References.MinimumLogLevel, 'None'))
  )

describe('setVacation', () => {
  describe('validation', () => {
    it('should reject end date before start date', async () => {
      const user = createTestUser({ id: 'user-1' })

      const error = await run(
        setVacation({
          startDate: daysFromNow(10),
          endDate: daysFromNow(5),
        }).pipe(Effect.flip, Effect.provide(createLayer([user])))
      )

      expect(error._tag).toBe('VacationDateError')
    })

    it('should reject end date in the past', async () => {
      const user = createTestUser({ id: 'user-1' })

      const error = await run(
        setVacation({
          startDate: daysFromNow(-10),
          endDate: daysFromNow(-5),
        }).pipe(Effect.flip, Effect.provide(createLayer([user])))
      )

      expect(error._tag).toBe('VacationDateError')
    })

    it('should reject vacations longer than 365 days', async () => {
      const user = createTestUser({ id: 'user-1' })

      const error = await run(
        setVacation({
          startDate: daysFromNow(1),
          endDate: daysFromNow(400),
        }).pipe(Effect.flip, Effect.provide(createLayer([user])))
      )

      expect(error._tag).toBe('VacationDateError')
    })

    it('should fail with UserNotFoundError for unknown user', async () => {
      const error = await run(
        setVacation({
          startDate: daysFromNow(1),
          endDate: daysFromNow(7),
        }).pipe(
          Effect.flip,
          Effect.provide(createLayer([], [], 'non-existent'))
        )
      )

      expect(error._tag).toBe('UserNotFoundError')
    })
  })

  describe('scheduling', () => {
    it('should schedule a future vacation without activating it', async () => {
      const user = createTestUser({ id: 'user-1' })
      const start = daysFromNow(5)
      const end = daysFromNow(12)

      const state = await run(
        setVacation({ startDate: start, endDate: end }).pipe(
          Effect.provide(createLayer([user]))
        )
      )

      expect(state.status).toBe('scheduled')
      expect(state.startDate).toEqual(start)
      expect(state.endDate).toEqual(end)
    })

    it('should activate immediately when the start date has passed', async () => {
      const user = createTestUser({ id: 'user-1' })

      const state = await run(
        setVacation({
          startDate: daysFromNow(-1),
          endDate: daysFromNow(7),
        }).pipe(Effect.provide(createLayer([user])))
      )

      expect(state.status).toBe('active')
    })

    it('should delete muted pending notifications on immediate activation but keep social and other users rows', async () => {
      const user = createTestUser({ id: 'user-1' })
      const notifications: Notification[] = [
        createTestNotification({
          id: 'n-care',
          userId: 'user-1',
          plantId: plant.id,
          type: 'watering_reminder',
          status: 'pending',
        }),
        createTestNotification({
          id: 'n-tip',
          userId: 'user-1',
          type: 'daily_tip',
          status: 'pending',
        }),
        createTestNotification({
          id: 'n-social',
          userId: 'user-1',
          type: 'delegation_request',
          status: 'pending',
        }),
        createTestNotification({
          id: 'n-other-user',
          userId: 'caretaker-1',
          type: 'watering_reminder',
          status: 'pending',
        }),
      ]

      await run(
        setVacation({
          startDate: daysFromNow(-1),
          endDate: daysFromNow(7),
        }).pipe(Effect.provide(createLayer([user], notifications)))
      )

      const remainingIds = pipe(
        Array.map(notifications, (n) => n.id),
        Array.sort(Order.String)
      )
      expect(remainingIds).toEqual(['n-other-user', 'n-social'])
    })
  })

  describe('active vacation edits', () => {
    const activeUser = (start: Date, end: Date) =>
      createTestUser({
        id: 'user-1',
        vacationStatus: 'active',
        vacationStart: start,
        vacationEnd: end,
      })

    it('should allow extending the end date with the same start date', async () => {
      const start = daysFromNow(-2)
      const user = activeUser(start, daysFromNow(5))
      const newEnd = daysFromNow(10)

      const state = await run(
        setVacation({ startDate: start, endDate: newEnd }).pipe(
          Effect.provide(createLayer([user]))
        )
      )

      expect(state.status).toBe('active')
      expect(state.endDate).toEqual(newEnd)
      expect(state.startDate).toEqual(start)
    })

    it('should start a new vacation when the scheduler ends the active one just before the extend takes the account', async () => {
      const start = daysFromNow(-2)
      const user = activeUser(start, daysFromNow(5))
      const newEnd = daysFromNow(10)
      const users = [user]
      const endOnce = Effect.sync(() => {
        if (users[0]?.vacationStatus === 'active') {
          users[0] = {
            ...user,
            vacationStatus: 'none',
            vacationStart: null,
            vacationEnd: null,
          }
        }
      })
      const world = worldOf(users, [], 'user-1', (store) => ({
        ...store,
        lockVacation: (userId, now) =>
          Effect.andThen(endOnce, store.lockVacation(userId, now)),
      }))

      const state = await run(
        setVacation({ startDate: start, endDate: newEnd }).pipe(
          Effect.provide(world.layer)
        )
      )

      expect(state).toEqual({
        status: 'active',
        startDate: start,
        endDate: newEnd,
      })
      expect(users[0]?.vacationStatus).toBe('active')
      expect(users[0]?.vacationEnd).toEqual(newEnd)
    })

    it('should reject changing the start date of an active vacation', async () => {
      const user = activeUser(daysFromNow(-2), daysFromNow(5))

      const error = await run(
        setVacation({
          startDate: daysFromNow(-1),
          endDate: daysFromNow(10),
        }).pipe(Effect.flip, Effect.provide(createLayer([user])))
      )

      expect(error._tag).toBe('VacationDateError')
    })
  })

  describe('an account that is not active', () => {
    it.each(['suspended', 'pending_deletion'] as const)(
      'answers UserNotFoundError to a %s account and writes nothing',
      async (status) => {
        const users = [createTestUser({ id: 'user-1', status })]
        const world = worldOf(users)

        const error = await run(
          setVacation({
            startDate: daysFromNow(-1),
            endDate: daysFromNow(7),
          }).pipe(Effect.flip, Effect.provide(world.layer))
        )

        expect(error._tag).toBe('UserNotFoundError')
        expect(users[0]?.vacationStatus).toBe('none')
        expect(world.writes).toEqual([])
        expect(world.events).toEqual([])
      }
    )
  })

  describe('what a set publishes', () => {
    it('says the vacation started when it starts at once', async () => {
      const world = worldOf([createTestUser({ id: 'user-1' })])

      await run(
        setVacation({
          startDate: daysFromNow(-1),
          endDate: daysFromNow(7),
        }).pipe(Effect.provide(world.layer))
      )

      expect(world.events).toEqual([
        { _tag: 'VacationStarted', userId: 'user-1' },
      ])
    })

    it('says nothing for a vacation that is only scheduled', async () => {
      const world = worldOf([createTestUser({ id: 'user-1' })])

      await run(
        setVacation({
          startDate: daysFromNow(2),
          endDate: daysFromNow(7),
        }).pipe(Effect.provide(world.layer))
      )

      expect(world.events).toEqual([])
    })

    it('says nothing when a running vacation only moves its end', async () => {
      const start = daysFromNow(-2)
      const world = worldOf([
        createTestUser({
          id: 'user-1',
          vacationStatus: 'active',
          vacationStart: start,
          vacationEnd: daysFromNow(5),
        }),
      ])

      await run(
        setVacation({ startDate: start, endDate: daysFromNow(9) }).pipe(
          Effect.provide(world.layer)
        )
      )

      expect(world.events).toEqual([])
    })
  })

  it('starts at once a scheduled vacation moved to a start that already passed', async () => {
    const users = [
      createTestUser({
        id: 'user-1',
        vacationStatus: 'scheduled',
        vacationStart: daysFromNow(3),
        vacationEnd: daysFromNow(9),
      }),
    ]
    const start = daysFromNow(-1)
    const end = daysFromNow(4)
    const world = worldOf(users)

    const state = await run(
      setVacation({ startDate: start, endDate: end }).pipe(
        Effect.provide(world.layer)
      )
    )

    expect(state).toEqual({ status: 'active', startDate: start, endDate: end })
    expect(users[0]).toMatchObject({
      vacationStatus: 'active',
      vacationStart: start,
      vacationEnd: end,
    })
  })
})
