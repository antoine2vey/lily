import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { mockUser1 } from '@lily/api/__tests__/fixtures/users'
import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockSubscriptionRepository } from '@lily/api/__tests__/mocks/subscription.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import {
  type INotificationRepository,
  NotificationRepository,
} from '@lily/api/repositories/notification.repository'
import {
  type IUserRepository,
  UserRepository,
} from '@lily/api/repositories/user.repository'
import {
  type Billing,
  type DetachedTurn,
  UsageTracker,
  UsageTrackerLive,
} from '@lily/api/services/subscriptions/usage-tracker'
import type { subscriptionUsage } from '@lily/db/schema'
import { LimitExceededError, type UsageField } from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import { Deferred, Effect, Exit, Fiber, Layer, Schema } from 'effect'
import { describe, expect, it, vi } from 'vitest'

class TurnFailed extends Schema.TaggedError<TurnFailed>()('TurnFailed', {}) {}

const usageAt = (
  overrides: Partial<typeof subscriptionUsage.$inferSelect> = {}
): typeof subscriptionUsage.$inferSelect => ({
  id: 'usage-1',
  userId: 'user-1',
  periodStart: new Date(),
  periodEnd: new Date(),
  aiChatsCount: 0,
  cardScansCount: 0,
  plantIdentifiesCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const createTestLayer = (options: {
  usage?: typeof subscriptionUsage.$inferSelect
  tier?: 'free' | 'paid'
}) => {
  const reserved: UsageField[] = []
  const released: UsageField[] = []

  const notifRepo = new Proxy({} as INotificationRepository, {
    get: () => () => Effect.succeed(null),
  })
  const userRepo = new Proxy({} as IUserRepository, {
    get: () => () => Effect.succeed(null),
  })

  const layer = UsageTrackerLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        MockAlerterLive,
        createMockSubscriptionRepository({
          usage: options.usage,
          tier: options.tier,
          onReserveUsage: (_userId, field) => reserved.push(field),
          onReleaseUsage: (_usageId, field) => released.push(field),
        }),
        Layer.succeed(NotificationRepository, notifRepo),
        Layer.succeed(UserRepository, userRepo)
      )
    )
  )

  return { layer, reserved, released }
}

describe('UsageTracker', () => {
  describe('reserve', () => {
    it('counts one unit for a free user under the limit', async () => {
      const { layer, reserved } = createTestLayer({
        usage: usageAt({ aiChatsCount: 4 }),
      })

      const reservation = await Effect.runPromise(
        Effect.gen(function* () {
          const tracker = yield* UsageTracker
          return yield* tracker.reserve('user-1', 'aiChats')
        }).pipe(Effect.provide(layer))
      )

      expect(reservation.usage.aiChatsCount).toBe(5)
      expect(reserved).toEqual(['aiChats'])
    })

    it('records one pending approaching_limit when usage crosses the threshold', async () => {
      const notifications: Notification[] = []
      const layer = UsageTrackerLive.pipe(
        Layer.provide(
          Layer.mergeAll(
            MockAlerterLive,
            createMockSubscriptionRepository({
              usage: usageAt({ userId: mockUser1.id, plantIdentifiesCount: 2 }),
            }),
            createMockNotificationRepository(notifications),
            createMockUserRepository([mockUser1])
          )
        )
      )

      await Effect.runPromise(
        Effect.gen(function* () {
          const tracker = yield* UsageTracker
          return yield* tracker.reserve(mockUser1.id, 'plantIdentifies')
        }).pipe(Effect.provide(layer))
      )

      await vi.waitFor(() => expect(notifications).toHaveLength(1))
      expect(notifications[0]).toMatchObject({
        userId: mockUser1.id,
        type: 'approaching_limit',
        status: 'pending',
        metadata: {},
      })
    })

    it('fails with LimitExceededError at the free limit and counts nothing', async () => {
      const { layer, reserved } = createTestLayer({
        usage: usageAt({ plantIdentifiesCount: 3 }),
      })

      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const tracker = yield* UsageTracker
          return yield* tracker.reserve('user-1', 'plantIdentifies')
        }).pipe(Effect.provide(layer))
      )

      expect(Exit.isFailure(exit)).toBe(true)
      const error = failureOf(exit)
      expect(error).toBeInstanceOf(LimitExceededError)
      expect((error as LimitExceededError).feature).toBe('plant_identifies')
      expect((error as LimitExceededError).limit).toBe(3)
      expect(reserved).toEqual([])
    })

    it('still counts usage for a paid user with no limit', async () => {
      const { layer, reserved } = createTestLayer({
        usage: usageAt({ cardScansCount: 500 }),
        tier: 'paid',
      })

      const reservation = await Effect.runPromise(
        Effect.gen(function* () {
          const tracker = yield* UsageTracker
          return yield* tracker.reserve('user-1', 'cardScans')
        }).pipe(Effect.provide(layer))
      )

      expect(reservation.usage.cardScansCount).toBe(501)
      expect(reserved).toEqual(['cardScans'])
    })

    it('release gives the unit back', async () => {
      const { layer, released } = createTestLayer({ usage: usageAt() })

      await Effect.runPromise(
        Effect.gen(function* () {
          const tracker = yield* UsageTracker
          const reservation = yield* tracker.reserve('user-1', 'aiChats')
          yield* reservation.release
        }).pipe(Effect.provide(layer))
      )

      expect(released).toEqual(['aiChats'])
    })
  })

  describe('withReservation', () => {
    it('keeps the unit when the body succeeds', async () => {
      const { layer, reserved, released } = createTestLayer({
        usage: usageAt(),
      })

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const tracker = yield* UsageTracker
          return yield* tracker.withReservation(
            'user-1',
            'cardScans',
            Effect.succeed('scanned')
          )
        }).pipe(Effect.provide(layer))
      )

      expect(result).toBe('scanned')
      expect(reserved).toEqual(['cardScans'])
      expect(released).toEqual([])
    })

    it('refunds the unit and surfaces the error when the body fails', async () => {
      const { layer, reserved, released } = createTestLayer({
        usage: usageAt(),
      })

      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const tracker = yield* UsageTracker
          return yield* tracker.withReservation(
            'user-1',
            'plantIdentifies',
            Effect.fail({ _tag: 'OpenAIError' as const })
          )
        }).pipe(Effect.provide(layer))
      )

      expect(Exit.isFailure(exit)).toBe(true)
      expect(reserved).toEqual(['plantIdentifies'])
      expect(released).toEqual(['plantIdentifies'])
    })

    it('does not run the body when the limit is reached', async () => {
      const { layer } = createTestLayer({
        usage: usageAt({ aiChatsCount: 10 }),
      })
      let ran = false

      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const tracker = yield* UsageTracker
          return yield* tracker.withReservation(
            'user-1',
            'aiChats',
            Effect.sync(() => {
              ran = true
            })
          )
        }).pipe(Effect.provide(layer))
      )

      expect(failureOf(exit)).toBeInstanceOf(LimitExceededError)
      expect(ran).toBe(false)
    })
  })

  describe('withDetachedReservation', () => {
    type Turn = DetachedTurn<string, TurnFailed, never, string, never, never>

    const turnThatBills = (
      billing: Billing,
      overrides: Partial<Turn> = {}
    ): Turn => ({
      start: Effect.succeed('started'),
      work: (started) => Effect.succeed(`${started} and worked`),
      bill: () => Effect.succeed(billing),
      detach: Effect.forkDetach,
      ...overrides,
    })

    const runTurn = (turn: Turn) =>
      Effect.gen(function* () {
        const tracker = yield* UsageTracker
        return yield* tracker.withDetachedReservation('user-1', 'aiChats', turn)
      })

    it('keeps the unit when the turn bills a charge', async () => {
      const { layer, reserved, released } = createTestLayer({
        usage: usageAt(),
      })

      const billing = await Effect.runPromise(
        Effect.gen(function* () {
          const { started, settled } = yield* runTurn(turnThatBills('charge'))
          expect(started).toBe('started')
          return yield* Fiber.join(settled)
        }).pipe(Effect.provide(layer))
      )

      expect(billing).toBe('charge')
      expect(reserved).toEqual(['aiChats'])
      expect(released).toEqual([])
    })

    it('gives the unit back once when the turn bills a refund', async () => {
      const { layer, released } = createTestLayer({ usage: usageAt() })

      const billing = await Effect.runPromise(
        Effect.gen(function* () {
          const { settled } = yield* runTurn(turnThatBills('refund'))
          return yield* Fiber.join(settled)
        }).pipe(Effect.provide(layer))
      )

      expect(billing).toBe('refund')
      expect(released).toEqual(['aiChats'])
    })

    it('does not start the turn when the limit is reached', async () => {
      const { layer, released } = createTestLayer({
        usage: usageAt({ aiChatsCount: 10 }),
      })
      let detached = 0

      const exit = await Effect.runPromiseExit(
        runTurn(
          turnThatBills('charge', {
            detach: (turn) =>
              Effect.forkDetach(turn).pipe(
                Effect.tap(() => Effect.sync(() => detached++))
              ),
          })
        ).pipe(Effect.provide(layer))
      )

      expect(failureOf(exit)).toBeInstanceOf(LimitExceededError)
      expect(detached).toBe(0)
      expect(released).toEqual([])
    })

    it('refunds and fails when the turn cannot start', async () => {
      const { layer, released } = createTestLayer({ usage: usageAt() })
      let detached = 0

      const exit = await Effect.runPromiseExit(
        runTurn(
          turnThatBills('charge', {
            start: Effect.fail(new TurnFailed()),
            detach: (turn) =>
              Effect.forkDetach(turn).pipe(
                Effect.tap(() => Effect.sync(() => detached++))
              ),
          })
        ).pipe(Effect.provide(layer))
      )

      expect(failureOf(exit)).toBeInstanceOf(TurnFailed)
      expect(detached).toBe(0)
      expect(released).toEqual(['aiChats'])
    })

    it('refunds when the caller is interrupted while the turn starts', async () => {
      const { layer, reserved, released } = createTestLayer({
        usage: usageAt(),
      })
      let detached = 0

      const exit = await Effect.runPromise(
        Effect.gen(function* () {
          const starting = yield* Deferred.make<void>()
          const caller = yield* Effect.forkChild(
            runTurn(
              turnThatBills('charge', {
                start: Deferred.succeed(starting, undefined).pipe(
                  Effect.andThen(Effect.never)
                ),
                detach: (turn) =>
                  Effect.forkDetach(turn).pipe(
                    Effect.tap(() => Effect.sync(() => detached++))
                  ),
              })
            )
          )
          yield* Deferred.await(starting)
          yield* Fiber.interrupt(caller)
          return yield* Fiber.await(caller)
        }).pipe(Effect.provide(layer))
      )

      expect(Exit.hasInterrupts(exit)).toBe(true)
      expect(reserved).toEqual(['aiChats'])
      expect(released).toEqual(['aiChats'])
      expect(detached).toBe(0)
    })

    it('refunds interrupted work without billing it', async () => {
      const { layer, released } = createTestLayer({ usage: usageAt() })
      let billed = 0

      const exit = await Effect.runPromise(
        Effect.gen(function* () {
          const working = yield* Deferred.make<void>()
          const { settled } = yield* runTurn(
            turnThatBills('charge', {
              work: () =>
                Deferred.succeed(working, undefined).pipe(
                  Effect.andThen(Effect.never)
                ),
              bill: () => Effect.sync(() => (billed++, 'charge' as const)),
            })
          )
          yield* Deferred.await(working)
          yield* Fiber.interrupt(settled)
          return yield* Fiber.await(settled)
        }).pipe(Effect.provide(layer))
      )

      expect(Exit.hasInterrupts(exit)).toBe(true)
      expect(billed).toBe(0)
      expect(released).toEqual(['aiChats'])
    })

    it('finishes billing and refunding when interrupted mid-bill', async () => {
      const { layer, released } = createTestLayer({ usage: usageAt() })
      let billFinished = false

      const exit = await Effect.runPromise(
        Effect.gen(function* () {
          const billing = yield* Deferred.make<void>()
          const resume = yield* Deferred.make<void>()
          const { settled } = yield* runTurn(
            turnThatBills('charge', {
              bill: () =>
                Deferred.succeed(billing, undefined).pipe(
                  Effect.andThen(Deferred.await(resume)),
                  Effect.andThen(
                    Effect.sync(() => {
                      billFinished = true
                      return 'refund' as const
                    })
                  )
                ),
            })
          )
          yield* Deferred.await(billing)
          const interrupting = yield* Effect.forkChild(Fiber.interrupt(settled))
          yield* Deferred.succeed(resume, undefined)
          yield* Fiber.join(interrupting)
          return yield* Fiber.await(settled)
        }).pipe(Effect.provide(layer))
      )

      // The settlement never leaves its uninterruptible region, so the
      // interrupt is never delivered and the fiber ends with its billing.
      expect(exit).toEqual(Exit.succeed('refund'))
      expect(billFinished).toBe(true)
      expect(released).toEqual(['aiChats'])
    })

    it('refunds and fails the settlement when billing dies', async () => {
      const { layer, released } = createTestLayer({ usage: usageAt() })

      const exit = await Effect.runPromise(
        Effect.gen(function* () {
          const { settled } = yield* runTurn(
            turnThatBills('charge', {
              bill: () => Effect.die(new Error('billing crashed')),
            })
          )
          return yield* Fiber.await(settled)
        }).pipe(Effect.provide(layer))
      )

      expect(Exit.isFailure(exit)).toBe(true)
      expect(Exit.hasInterrupts(exit)).toBe(false)
      expect(released).toEqual(['aiChats'])
    })
  })
})
