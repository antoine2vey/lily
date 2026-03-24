import type { SqlError } from '@effect/sql/SqlError'
import {
  type GiftCodeRecord,
  GiftCodeRepository,
} from '@lily/api/repositories/gift-code.repository'
import { isOverdue } from '@lily/shared'
import type { GiftCodeUpdateRequest } from '@lily/shared/admin'
import {
  GiftCodeDuplicateError,
  GiftCodeExpiryInPastError,
  GiftCodeMaxUsagesTooLowError,
  GiftCodeNotFoundError,
} from '@lily/shared/errors/gift-code'
import { DateTime, Effect } from 'effect'

export const updateGiftCode = (
  codeId: string,
  data: GiftCodeUpdateRequest
): Effect.Effect<
  GiftCodeRecord,
  | SqlError
  | GiftCodeNotFoundError
  | GiftCodeDuplicateError
  | GiftCodeMaxUsagesTooLowError
  | GiftCodeExpiryInPastError,
  GiftCodeRepository
> =>
  Effect.gen(function* () {
    const repo = yield* GiftCodeRepository

    if (data.expiresAt && isOverdue(DateTime.unsafeMake(data.expiresAt))) {
      return yield* new GiftCodeExpiryInPastError()
    }

    if (
      data.code !== undefined ||
      (data.maxUsages !== undefined && data.maxUsages > 0)
    ) {
      const current = yield* repo.findById(codeId)
      if (!current) {
        return yield* new GiftCodeNotFoundError()
      }

      if (data.code !== undefined) {
        const existing = yield* repo.findByCode(data.code)
        if (existing && existing.id !== codeId) {
          return yield* new GiftCodeDuplicateError()
        }
      }

      if (
        data.maxUsages !== undefined &&
        data.maxUsages > 0 &&
        data.maxUsages < current.currentUsages
      ) {
        return yield* new GiftCodeMaxUsagesTooLowError({
          message: `Max usages (${data.maxUsages}) cannot be less than current redemptions (${current.currentUsages})`,
        })
      }
    }

    const updated = yield* repo.update(codeId, data)
    if (!updated) {
      return yield* new GiftCodeNotFoundError()
    }

    return updated
  }).pipe(
    Effect.withSpan('AdminService.updateGiftCode', {
      attributes: { 'giftCode.id': codeId },
    })
  )
