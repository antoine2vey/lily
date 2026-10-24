import { GiftCodeRepository } from '@lily/api/repositories/gift-code.repository'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import { computePeriodEnd } from '@lily/api/services/helpers/gift-duration'
import type { RateLimitExceededError } from '@lily/api/services/rate-limiter/errors'
import {
  RATE_LIMITS,
  RateLimiterService,
} from '@lily/api/services/rate-limiter/service'
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
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

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
  | GiftCodeAlreadyRedeemedError
  | RateLimitExceededError,
  | GiftCodeRepository
  | SubscriptionRepository
  | SqlClient.SqlClient
  | RateLimiterService
> =>
  Effect.gen(function* () {
    const giftCodeRepo = yield* GiftCodeRepository
    const subRepo = yield* SubscriptionRepository
    const sql = yield* SqlClient.SqlClient
    const rateLimiter = yield* RateLimiterService

    // Codes are admin-chosen words, so guessing must be throttled
    yield* rateLimiter.checkRateLimit(
      `redeem-code:${userId}`,
      RATE_LIMITS.REDEEM_CODE
    )

    const giftCode = yield* giftCodeRepo.findByCode(code)
    if (!giftCode) {
      return yield* new GiftCodeNotFoundError()
    }

    if (!giftCode.isActive) {
      return yield* new GiftCodeInactiveError()
    }

    if (
      giftCode.expiresAt &&
      isOverdue(DateTime.makeUnsafe(giftCode.expiresAt))
    ) {
      return yield* new GiftCodeExpiredError()
    }

    const periodStart = DateTime.toDate(DateTime.nowUnsafe())
    const periodEnd = computePeriodEnd(giftCode.duration)

    yield* sql.withTransaction(
      Effect.gen(function* () {
        const claimed = yield* giftCodeRepo.claimUsage(giftCode.id)
        if (!claimed) {
          return yield* new GiftCodeExhaustedError()
        }

        yield* giftCodeRepo
          .createRedemption(giftCode.id, userId)
          .pipe(
            Effect.catchReason(
              'SqlError',
              'UniqueViolation',
              () => new GiftCodeAlreadyRedeemedError()
            )
          )

        yield* subRepo.create({
          userId,
          tier: 'paid',
          status: 'active',
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        })

        yield* subRepo.logEvent(userId, 'gift_code_redeemed', {
          codeId: giftCode.id,
          code: giftCode.code,
          duration: giftCode.duration,
        })
      })
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
