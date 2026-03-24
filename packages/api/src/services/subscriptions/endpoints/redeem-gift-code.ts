import type { SqlError } from '@effect/sql/SqlError'
import { GiftCodeRepository } from '@lily/api/repositories/gift-code.repository'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import { computePeriodEnd } from '@lily/api/services/helpers/gift-duration'
import { isOverdue } from '@lily/shared'
import type { RedeemGiftCodeResponse } from '@lily/shared/admin'
import {
  GiftCodeAlreadyRedeemedError,
  GiftCodeExhaustedError,
  GiftCodeExpiredError,
  GiftCodeInactiveError,
  GiftCodeNotFoundError,
} from '@lily/shared/errors/gift-code'
import { DateTime, Effect } from 'effect'

export const redeemGiftCode = (
  userId: string,
  code: string
): Effect.Effect<
  RedeemGiftCodeResponse,
  | SqlError
  | GiftCodeNotFoundError
  | GiftCodeInactiveError
  | GiftCodeExpiredError
  | GiftCodeExhaustedError
  | GiftCodeAlreadyRedeemedError,
  GiftCodeRepository | SubscriptionRepository
> =>
  Effect.gen(function* () {
    const giftCodeRepo = yield* GiftCodeRepository
    const subRepo = yield* SubscriptionRepository

    const giftCode = yield* giftCodeRepo.findByCode(code)
    if (!giftCode) {
      return yield* new GiftCodeNotFoundError()
    }

    if (!giftCode.isActive) {
      return yield* new GiftCodeInactiveError()
    }

    if (
      giftCode.expiresAt &&
      isOverdue(DateTime.unsafeMake(giftCode.expiresAt))
    ) {
      return yield* new GiftCodeExpiredError()
    }

    // 0 = unlimited
    if (
      giftCode.maxUsages > 0 &&
      giftCode.currentUsages >= giftCode.maxUsages
    ) {
      return yield* new GiftCodeExhaustedError()
    }

    const existingRedemption = yield* giftCodeRepo.findRedemption(
      giftCode.id,
      userId
    )
    if (existingRedemption) {
      return yield* new GiftCodeAlreadyRedeemedError()
    }

    const periodStart = DateTime.toDate(DateTime.unsafeNow())
    const periodEnd = computePeriodEnd(giftCode.duration)

    yield* Effect.all(
      [
        subRepo.create({
          userId,
          tier: 'paid',
          status: 'active',
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        }),
        giftCodeRepo.incrementUsage(giftCode.id),
        giftCodeRepo.createRedemption(giftCode.id, userId),
        subRepo.logEvent(userId, 'gift_code_redeemed', {
          codeId: giftCode.id,
          code: giftCode.code,
          duration: giftCode.duration,
        }),
      ],
      { concurrency: 'unbounded' }
    )

    return {
      message: `Successfully redeemed gift code ${giftCode.code}`,
      tier: 'paid' as const,
      status: 'active' as const,
      periodStart,
      periodEnd,
    }
  }).pipe(
    Effect.withSpan('SubscriptionService.redeemGiftCode', {
      attributes: { 'giftCode.code': code },
    })
  )
