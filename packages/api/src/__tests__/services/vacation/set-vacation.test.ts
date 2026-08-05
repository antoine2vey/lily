import { createTestNotification } from '@lily/api/__tests__/fixtures/notifications'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { setVacation } from '@lily/api/services/vacation/endpoints/set-vacation'
import type { User } from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import { Array, Effect, Layer, Logger, LogLevel, Order, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

const daysFromNow = (days: number): Date =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000)

const createLayer = (
  users: User[],
  notifications: Notification[] = [],
  currentUserId = 'user-1'
) =>
  Layer.mergeAll(
    createMockUserRepository(users),
    createMockNotificationRepository(notifications),
    createMockCurrentUser({ id: currentUserId })
  )

const run = <A, E>(effect: Effect.Effect<A, E, never>): Promise<A> =>
  Effect.runPromise(effect.pipe(Logger.withMinimumLogLevel(LogLevel.None)))

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
        Array.sort(Order.string)
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
})
