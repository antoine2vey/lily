import { createTestNotification } from '@lily/api/__tests__/fixtures/notifications'
import { mockUser1 } from '@lily/api/__tests__/fixtures/users'
import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { notificationMocks } from '@lily/api/__tests__/mocks/notification-table'
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
import {
  isInDndWindow,
  LimitExceededError,
  timeToMinutes,
  type UsageField,
  withTimeZone,
  ZoneName,
} from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import { defectOf, failureOf } from '@lily/shared/testing'
import {
  Array,
  DateTime,
  Deferred,
  Effect,
  Exit,
  Fiber,
  FiberSet,
  Layer,
  pipe,
  Random,
  Schema,
} from 'effect'
import { describe, expect, it, vi } from 'vitest'

class TurnFailed extends Schema.TaggedError<
  TurnFailed,
  { readonly brand: unique symbol }
>()('TurnFailed', {}) {}

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
  settlingFails?: boolean
}) => {
  const reserved: UsageField[] = []
  const released: UsageField[] = []
  const charged: UsageField[] = []

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
          settlingFails: options.settlingFails,
          onReleaseUsage: (_reservationId, field) => released.push(field),
          onChargeUsage: (_reservationId, field) => charged.push(field),
        }),
        Layer.succeed(NotificationRepository, notifRepo),
        Layer.succeed(UserRepository, userRepo)
      )
    )
  )

  return { layer, reserved, released, charged }
}

describe('UsageTracker', () => {
  describe('withReservation', () => {
    it('keeps the unit when the body succeeds', async () => {
      const { layer, reserved, released, charged } = createTestLayer({
        usage: usageAt({ aiChatsCount: 4 }),
      })

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const tracker = yield* UsageTracker
          return yield* tracker.withReservation(
            'user-1',
            'aiChats',
            Effect.succeed('answered')
          )
        }).pipe(Effect.provide(layer))
      )

      expect(result).toBe('answered')
      expect(reserved).toEqual(['aiChats'])
      expect(released).toEqual([])
      expect(charged).toEqual(['aiChats'])
    })

    it('answers with the result when the charge cannot be written', async () => {
      const { layer } = createTestLayer({
        usage: usageAt(),
        settlingFails: true,
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
    })

    it('surfaces the error of the body when the refund cannot be written', async () => {
      const { layer } = createTestLayer({
        usage: usageAt(),
        settlingFails: true,
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

      expect(failureOf(exit)._tag).toBe('OpenAIError')
    })

    it('still counts usage for a paid user with no limit', async () => {
      const { layer, reserved, released } = createTestLayer({
        usage: usageAt({ cardScansCount: 500 }),
        tier: 'paid',
      })

      await Effect.runPromise(
        Effect.gen(function* () {
          const tracker = yield* UsageTracker
          return yield* tracker.withReservation(
            'user-1',
            'cardScans',
            Effect.void
          )
        }).pipe(Effect.provide(layer))
      )

      expect(reserved).toEqual(['cardScans'])
      expect(released).toEqual([])
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
            notificationMocks(notifications).repository,
            createMockUserRepository([mockUser1])
          )
        )
      )

      await Effect.runPromise(
        Effect.gen(function* () {
          const tracker = yield* UsageTracker
          return yield* tracker.withReservation(
            mockUser1.id,
            'plantIdentifies',
            Effect.void
          )
        }).pipe(Effect.provide(layer))
      )

      await vi.waitFor(() => expect(notifications).toHaveLength(1))
      expect(notifications[0]).toMatchObject({
        userId: mockUser1.id,
        type: 'approaching_limit',
        status: 'pending',
        params: { usageCount: 3, usageMax: 3, feature: 'plantIdentifies' },
        metadata: {},
      })
    })

    it('does not nudge again later in the same local day, past UTC midnight', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-06-16T02:00:00.000Z'))
      const user = {
        ...mockUser1,
        timezone: ZoneName.make('America/Los_Angeles'),
      }
      const notifications: Notification[] = [
        createTestNotification({
          userId: user.id,
          type: 'approaching_limit',
          createdAt: new Date('2026-06-15T20:00:00.000Z'),
        }),
      ]
      const checked = Promise.withResolvers<void>()
      const notificationRepo = Layer.effect(
        NotificationRepository,
        Effect.gen(function* () {
          const repo = yield* NotificationRepository
          const observed: INotificationRepository = {
            ...repo,
            hasNotificationIn: (window) =>
              repo
                .hasNotificationIn(window)
                .pipe(Effect.ensuring(Effect.sync(checked.resolve))),
          }
          return observed
        })
      ).pipe(Layer.provide(notificationMocks(notifications).repository))
      const layer = UsageTrackerLive.pipe(
        Layer.provide(
          Layer.mergeAll(
            MockAlerterLive,
            createMockSubscriptionRepository({
              usage: usageAt({ userId: user.id, plantIdentifiesCount: 2 }),
            }),
            notificationRepo,
            createMockUserRepository([user])
          )
        )
      )

      await Effect.runPromise(
        Effect.gen(function* () {
          const tracker = yield* UsageTracker
          return yield* tracker.withReservation(
            user.id,
            'plantIdentifies',
            Effect.void
          )
        }).pipe(Effect.provide(layer))
      )
      await checked.promise
      await new Promise((resolve) => setImmediate(resolve))
      vi.useRealTimers()

      expect(notifications).toHaveLength(1)
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

      expect(failureOf(exit)._tag).toBe('OpenAIError')
      expect(reserved).toEqual(['plantIdentifies'])
      expect(released).toEqual(['plantIdentifies'])
    })

    it('fails with LimitExceededError at the free limit and runs nothing', async () => {
      const { layer, reserved } = createTestLayer({
        usage: usageAt({ plantIdentifiesCount: 3 }),
      })
      let ran = false

      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const tracker = yield* UsageTracker
          return yield* tracker.withReservation(
            'user-1',
            'plantIdentifies',
            Effect.sync(() => {
              ran = true
            })
          )
        }).pipe(Effect.provide(layer))
      )

      const error = failureOf(exit)
      expect(error).toBeInstanceOf(LimitExceededError)
      expect((error as LimitExceededError).feature).toBe('plant_identifies')
      expect((error as LimitExceededError).limit).toBe(3)
      expect(ran).toBe(false)
      expect(reserved).toEqual([])
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
      const { layer, reserved, released, charged } = createTestLayer({
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
      expect(charged).toEqual(['aiChats'])
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

      expect(defectOf(exit)).toEqual(new Error('billing crashed'))
      expect(Exit.hasInterrupts(exit)).toBe(false)
      expect(released).toEqual(['aiChats'])
    })

    it('refunds a turn handed to a closed fiber set', async () => {
      const { layer, released } = createTestLayer({ usage: usageAt() })
      const closedSet = await Effect.runPromise(
        Effect.scoped(FiberSet.make<Billing>())
      )
      let billed = 0

      const exit = await Effect.runPromise(
        Effect.gen(function* () {
          const { settled } = yield* runTurn(
            turnThatBills('charge', {
              bill: () => Effect.sync(() => (billed++, 'charge' as const)),
              detach: (turn) => FiberSet.run(closedSet, turn),
            })
          )
          return yield* Fiber.await(settled)
        }).pipe(Effect.provide(layer))
      )

      expect(Exit.hasInterrupts(exit)).toBe(true)
      expect(billed).toBe(0)
      await vi.waitFor(() => expect(released).toEqual(['aiChats']))
    })

    it('refunds a detached fiber interrupted before its first step', async () => {
      const { layer, released } = createTestLayer({ usage: usageAt() })
      let billed = 0

      const exit = await Effect.runPromise(
        Effect.gen(function* () {
          const { settled } = yield* runTurn(
            turnThatBills('charge', {
              bill: () => Effect.sync(() => (billed++, 'charge' as const)),
              detach: (turn) =>
                Effect.forkDetach(turn).pipe(Effect.tap(Fiber.interrupt)),
            })
          )
          return yield* Fiber.await(settled)
        }).pipe(Effect.provide(layer))
      )

      expect(Exit.hasInterrupts(exit)).toBe(true)
      expect(billed).toBe(0)
      await vi.waitFor(() => expect(released).toEqual(['aiChats']))
    })

    it('refunds when detaching the turn dies', async () => {
      const { layer, released } = createTestLayer({ usage: usageAt() })

      const exit = await Effect.runPromiseExit(
        runTurn(
          turnThatBills('charge', {
            detach: () => Effect.die(new Error('fiber set gone')),
          })
        ).pipe(Effect.provide(layer))
      )

      expect(defectOf(exit)).toEqual(new Error('fiber set gone'))
      expect(released).toEqual(['aiChats'])
    })
  })
})

describe('the approaching_limit slot', () => {
  // Sunday in Paris (UTC+2).
  const SUNDAY_06_30 = new Date('2026-06-14T04:30:00.000Z')
  const SUNDAY_09_30 = new Date('2026-06-14T07:30:00.000Z')
  const SUNDAY_23_30 = new Date('2026-06-14T21:30:00.000Z')

  // A roll under 0.5 prefers the morning window, and these land on the middle
  // of a whole window.
  const MORNING = 0.25
  const EVENING = 0.75
  const ROLLS = Array.makeBy(20, (i) => i / 20)

  const PARIS = ZoneName.make('Europe/Paris')
  const inParis = (dnd: readonly [string, string] | null) => ({
    ...mockUser1,
    timezone: PARIS,
    doNotDisturb: dnd !== null,
    doNotDisturbStart: dnd?.[0] ?? null,
    doNotDisturbEnd: dnd?.[1] ?? null,
  })

  const rolling = (roll: number): Random.Random => ({
    nextDoubleUnsafe: () => roll,
    nextIntUnsafe: () => 0,
  })

  const slotOf = async (
    now: Date,
    roll: number,
    dnd: readonly [string, string] | null = null
  ): Promise<Date> => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)
    const user = inParis(dnd)
    const recorded = Promise.withResolvers<Notification>()
    const layer = UsageTrackerLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          MockAlerterLive,
          createMockSubscriptionRepository({
            usage: usageAt({ userId: user.id, plantIdentifiesCount: 2 }),
          }),
          notificationMocks([], { onCreate: recorded.resolve }).repository,
          createMockUserRepository([user])
        )
      )
    )
    try {
      await Effect.runPromise(
        Effect.gen(function* () {
          const tracker = yield* UsageTracker
          return yield* tracker.withReservation(
            user.id,
            'plantIdentifies',
            Effect.void
          )
        }).pipe(
          Effect.provide(layer),
          Effect.provideService(Random.Random, rolling(roll))
        )
      )
      return (await recorded.promise).scheduledAt
    } finally {
      vi.useRealTimers()
    }
  }

  const slotsOverRolls = async (
    now: Date,
    dnd: readonly [string, string] | null = null
  ): Promise<ReadonlyArray<readonly [number, Date]>> => {
    const slots: Array<readonly [number, Date]> = []
    for (const roll of ROLLS) slots.push([roll, await slotOf(now, roll, dnd)])
    return slots
  }

  const minuteInParis = (slot: Date): number => {
    const { hour, minute } = DateTime.toParts(
      withTimeZone(DateTime.makeUnsafe(slot), PARIS)
    )
    return hour * 60 + minute
  }

  it('waits for the next local day once both windows are over', async () => {
    expect([
      (await slotOf(SUNDAY_23_30, MORNING)).toISOString(),
      (await slotOf(SUNDAY_23_30, EVENING)).toISOString(),
    ]).toEqual(['2026-06-15T05:00:00.000Z', '2026-06-15T18:00:00.000Z'])
  })

  it('takes the evening window at 09:30, the morning one being over', async () => {
    expect((await slotOf(SUNDAY_09_30, MORNING)).toISOString()).toBe(
      '2026-06-14T18:00:00.000Z'
    )
  })

  it('never picks a minute already past inside a window under way', async () => {
    expect(
      pipe(
        await slotsOverRolls(SUNDAY_06_30),
        Array.filter(([, slot]) => slot <= SUNDAY_06_30),
        Array.map(([roll, slot]) => `roll ${roll}: ${slot.toISOString()}`)
      )
    ).toEqual([])
  })

  it('keeps the next-day slot out of a 22:00-07:00 do-not-disturb', async () => {
    const [start, end] = ['22:00', '07:00'] as const
    const faults = Array.flatMap(
      await slotsOverRolls(SUNDAY_23_30, [start, end]),
      ([roll, slot]) =>
        Array.map(
          Array.filter(
            [
              [
                isInDndWindow(
                  minuteInParis(slot),
                  timeToMinutes(start),
                  timeToMinutes(end)
                ),
                'is inside do-not-disturb',
              ],
              [slot <= SUNDAY_23_30, 'is not after now'],
            ] as const,
            ([broken]) => broken
          ),
          ([, rule]) => `roll ${roll}: ${slot.toISOString()} ${rule}`
        )
    )

    expect(faults).toEqual([])
    expect(
      (await slotOf(SUNDAY_23_30, MORNING, [start, end])).toISOString()
    ).toBe('2026-06-15T05:30:00.000Z')
  })

  it('records the notice at now when do-not-disturb covers both windows', async () => {
    expect(
      (await slotOf(SUNDAY_23_30, MORNING, ['05:00', '23:00'])).toISOString()
    ).toBe(SUNDAY_23_30.toISOString())
  })
})
