import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { createMockSubscriptionRepository } from '@lily/api/__tests__/mocks/subscription.repository'
import {
  type INotificationRepository,
  NotificationRepository,
} from '@lily/api/repositories/notification.repository'
import {
  type IUserRepository,
  UserRepository,
} from '@lily/api/repositories/user.repository'
import {
  UsageTracker,
  UsageTrackerLive,
} from '@lily/api/services/subscriptions/usage-tracker'
import type { subscriptionUsage } from '@lily/db/schema'
import { LimitExceededError, type UsageField } from '@lily/shared'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

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
          onReleaseUsage: (_userId, field) => released.push(field),
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
})
