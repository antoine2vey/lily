import { createMockGiftCodeRepository } from '@lily/api/__tests__/mocks/gift-code.repository'
import { createMockSubscriptionRepository } from '@lily/api/__tests__/mocks/subscription.repository'
import type { GiftCodeRecord } from '@lily/api/repositories/gift-code.repository'
import type { CreateSubscriptionData } from '@lily/api/repositories/subscription.repository'
import { redeemGiftCode } from '@lily/api/services/subscriptions/endpoints/redeem-gift-code'
import type { giftCodeRedemptions } from '@lily/db/schema'
import { Cause, Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

type Redemption = typeof giftCodeRedemptions.$inferSelect

const activeCode: GiftCodeRecord = {
  id: 'code-1',
  code: 'TESTCODE',
  duration: '1m',
  maxUsages: 100,
  currentUsages: 5,
  isActive: true,
  expiresAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
}

const inactiveCode: GiftCodeRecord = {
  ...activeCode,
  id: 'code-inactive',
  code: 'INACTIVE',
  isActive: false,
}

const expiredCode: GiftCodeRecord = {
  ...activeCode,
  id: 'code-expired',
  code: 'EXPIRED',
  expiresAt: new Date('2020-01-01'),
}

const exhaustedCode: GiftCodeRecord = {
  ...activeCode,
  id: 'code-exhausted',
  code: 'EXHAUSTED',
  maxUsages: 10,
  currentUsages: 10,
}

const allCodes = [activeCode, inactiveCode, expiredCode, exhaustedCode]

const baseLayers = (
  opts: {
    codes?: readonly GiftCodeRecord[]
    redemptions?: readonly Redemption[]
    onIncrementUsage?: (id: string) => void
    onCreateRedemption?: (giftCodeId: string, userId: string) => void
    onCreate?: (data: CreateSubscriptionData) => void
  } = {}
) =>
  Layer.mergeAll(
    createMockGiftCodeRepository({
      codes: opts.codes ?? allCodes,
      ...(opts.redemptions !== undefined
        ? { redemptions: opts.redemptions }
        : {}),
      ...(opts.onIncrementUsage !== undefined
        ? { onIncrementUsage: opts.onIncrementUsage }
        : {}),
      ...(opts.onCreateRedemption !== undefined
        ? { onCreateRedemption: opts.onCreateRedemption }
        : {}),
    }),
    createMockSubscriptionRepository({
      ...(opts.onCreate !== undefined ? { onCreate: opts.onCreate } : {}),
    })
  )

describe('redeemGiftCode', () => {
  it('should successfully redeem a valid code', async () => {
    let capturedSubscription: CreateSubscriptionData | undefined
    let incrementedCodeId: string | undefined
    let redemptionCreated = false

    const result = await Effect.runPromise(
      redeemGiftCode('user-1', 'TESTCODE').pipe(
        Effect.provide(
          baseLayers({
            onCreate: (data) => {
              capturedSubscription = data
            },
            onIncrementUsage: (id) => {
              incrementedCodeId = id
            },
            onCreateRedemption: () => {
              redemptionCreated = true
            },
          })
        )
      )
    )

    expect(result.tier).toBe('paid')
    expect(result.status).toBe('active')
    expect(result.periodStart).toBeInstanceOf(Date)
    expect(result.periodEnd).toBeInstanceOf(Date)
    expect(result.periodEnd.getTime()).toBeGreaterThan(
      result.periodStart.getTime()
    )
    expect(capturedSubscription?.tier).toBe('paid')
    expect(capturedSubscription?.status).toBe('active')
    expect(incrementedCodeId).toBe('code-1')
    expect(redemptionCreated).toBe(true)
  })

  it('should be case-insensitive', async () => {
    const result = await Effect.runPromise(
      redeemGiftCode('user-1', 'testcode').pipe(Effect.provide(baseLayers()))
    )

    expect(result.tier).toBe('paid')
  })

  it('should fail when code not found', async () => {
    const result = await Effect.runPromiseExit(
      redeemGiftCode('user-1', 'NOTREAL').pipe(Effect.provide(baseLayers()))
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result)) {
      const error = Cause.failureOption(result.cause)
      expect(error._tag).toBe('Some')
      if (error._tag === 'Some') {
        expect(error.value._tag).toBe('GiftCodeNotFoundError')
      }
    }
  })

  it('should fail when code is inactive', async () => {
    const result = await Effect.runPromiseExit(
      redeemGiftCode('user-1', 'INACTIVE').pipe(Effect.provide(baseLayers()))
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result)) {
      const error = Cause.failureOption(result.cause)
      expect(error._tag).toBe('Some')
      if (error._tag === 'Some') {
        expect(error.value._tag).toBe('GiftCodeInactiveError')
      }
    }
  })

  it('should fail when code is expired', async () => {
    const result = await Effect.runPromiseExit(
      redeemGiftCode('user-1', 'EXPIRED').pipe(Effect.provide(baseLayers()))
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result)) {
      const error = Cause.failureOption(result.cause)
      expect(error._tag).toBe('Some')
      if (error._tag === 'Some') {
        expect(error.value._tag).toBe('GiftCodeExpiredError')
      }
    }
  })

  it('should fail when code is exhausted', async () => {
    const result = await Effect.runPromiseExit(
      redeemGiftCode('user-1', 'EXHAUSTED').pipe(Effect.provide(baseLayers()))
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result)) {
      const error = Cause.failureOption(result.cause)
      expect(error._tag).toBe('Some')
      if (error._tag === 'Some') {
        expect(error.value._tag).toBe('GiftCodeExhaustedError')
      }
    }
  })

  it('should fail when already redeemed by user', async () => {
    const existingRedemption: Redemption = {
      id: 'redemption-1',
      giftCodeId: 'code-1',
      userId: 'user-1',
      redeemedAt: new Date(),
    }

    const result = await Effect.runPromiseExit(
      redeemGiftCode('user-1', 'TESTCODE').pipe(
        Effect.provide(baseLayers({ redemptions: [existingRedemption] }))
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result)) {
      const error = Cause.failureOption(result.cause)
      expect(error._tag).toBe('Some')
      if (error._tag === 'Some') {
        expect(error.value._tag).toBe('GiftCodeAlreadyRedeemedError')
      }
    }
  })

  it('should allow unlimited usage when maxUsages is 0', async () => {
    const unlimitedCode: GiftCodeRecord = {
      ...activeCode,
      id: 'code-unlimited',
      code: 'UNLIMITED',
      maxUsages: 0,
      currentUsages: 999,
    }

    const result = await Effect.runPromise(
      redeemGiftCode('user-1', 'UNLIMITED').pipe(
        Effect.provide(baseLayers({ codes: [unlimitedCode] }))
      )
    )

    expect(result.tier).toBe('paid')
  })
})
