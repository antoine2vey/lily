import { mockCanopyId } from '@lily/api/__tests__/fixtures/canopies'
import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { createMockAchievementRepository } from '@lily/api/__tests__/mocks/achievement.repository'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockSubscriptionRepository } from '@lily/api/__tests__/mocks/subscription.repository'
import {
  LimitChecker,
  LimitCheckerLive,
} from '@lily/api/services/subscriptions/limit-checker'
import type { userSubscriptions } from '@lily/db/schema'
import {
  type CanopyId,
  LimitExceededError,
  type PlantOwner,
} from '@lily/shared'
import { DateTime, Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

type Subscription = typeof userSubscriptions.$inferSelect

const canopy: PlantOwner = {
  _tag: 'Canopy',
  canopyId: 'canopy-1' as CanopyId,
}

const premium = (
  userId: string,
  periodEnd: DateTime.DateTime.PartsForMath['days']
): Subscription => ({
  id: `sub-${userId}`,
  userId,
  tier: 'paid',
  status: 'active',
  trialStartsAt: null,
  trialEndsAt: null,
  currentPeriodStart: DateTime.toDateUtc(DateTime.nowUnsafe()),
  currentPeriodEnd: DateTime.toDateUtc(
    DateTime.add(DateTime.nowUnsafe(), { days: periodEnd })
  ),
  externalSubscriptionId: null,
  externalCustomerId: null,
  provider: 'revenuecat',
  productId: null,
  store: null,
  canceledAt: null,
  createdAt: DateTime.toDateUtc(DateTime.nowUnsafe()),
  updatedAt: DateTime.toDateUtc(DateTime.nowUnsafe()),
})

const check = (options: {
  owner: PlantOwner
  canopyPlants: number
  personalPlants: number
  subscriptions: Record<string, Subscription>
}) =>
  Effect.runPromiseExit(
    Effect.flatMap(LimitChecker, (checker) =>
      checker.checkPlantLimit(options.owner)
    ).pipe(
      Effect.provide(
        LimitCheckerLive.pipe(
          Layer.provide(
            Layer.mergeAll(
              createMockSubscriptionRepository({
                subscriptionsByUser: options.subscriptions,
              }),
              createMockAchievementRepository({
                achievements: [],
                livingPlantCountFor: (owner) =>
                  owner._tag === 'Canopy'
                    ? options.canopyPlants
                    : options.personalPlants,
              }),
              createMockCanopyRepository([
                {
                  userId: 'alex',
                  canopyId: mockCanopyId,
                  role: 'owner',
                  joinedAt: new Date('2024-01-01'),
                },
                {
                  userId: 'lily',
                  canopyId: mockCanopyId,
                  role: 'member',
                  joinedAt: new Date('2024-02-01'),
                },
              ])
            )
          )
        )
      )
    )
  )

describe('checkPlantLimit for a Canopy', () => {
  it('caps a free Canopy at the free tier, counting its own living plants', async () => {
    const under = await check({
      owner: canopy,
      canopyPlants: 4,
      personalPlants: 99,
      subscriptions: {},
    })
    const at = await check({
      owner: canopy,
      canopyPlants: 5,
      personalPlants: 0,
      subscriptions: {},
    })

    expect(Exit.isSuccess(under)).toBe(true)
    expect(failureOf(at)).toEqual(
      new LimitExceededError({
        feature: 'canopy_plants',
        limit: 5,
        current: 5,
        message:
          'This Canopy has reached its limit of 5 plants. Any member going Premium lifts it.',
      })
    )
  })

  it('lifts the cap while any member is premium', async () => {
    const exit = await check({
      owner: canopy,
      canopyPlants: 40,
      personalPlants: 0,
      subscriptions: { lily: premium('lily', 30) },
    })
    expect(Exit.isSuccess(exit)).toBe(true)
  })

  it('caps again once that premium period has lapsed', async () => {
    const exit = await check({
      owner: canopy,
      canopyPlants: 5,
      personalPlants: 0,
      subscriptions: { lily: premium('lily', -1) },
    })
    expect(failureOf(exit)).toMatchObject({ feature: 'canopy_plants' })
  })

  it("keeps a member's personal cap their own", async () => {
    const exit = await check({
      owner: { _tag: 'User', userId: 'alex' },
      canopyPlants: 0,
      personalPlants: 5,
      subscriptions: { lily: premium('lily', 30) },
    })
    expect(failureOf(exit)).toMatchObject({ feature: 'plants', limit: 5 })
  })
})
