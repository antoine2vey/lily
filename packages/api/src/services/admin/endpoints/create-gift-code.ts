import type { SqlError } from '@effect/sql/SqlError'
import {
  type GiftCodeRecord,
  GiftCodeRepository,
} from '@lily/api/repositories/gift-code.repository'
import { isOverdue } from '@lily/shared'
import type { GiftCodeCreateRequest } from '@lily/shared/admin'
import {
  GiftCodeDuplicateError,
  GiftCodeExpiryInPastError,
} from '@lily/shared/errors/gift-code'
import { DateTime, Effect } from 'effect'

export const createGiftCode = (
  data: GiftCodeCreateRequest
): Effect.Effect<
  GiftCodeRecord,
  SqlError | GiftCodeDuplicateError | GiftCodeExpiryInPastError,
  GiftCodeRepository
> =>
  Effect.gen(function* () {
    const repo = yield* GiftCodeRepository

    if (data.expiresAt && isOverdue(DateTime.unsafeMake(data.expiresAt))) {
      return yield* new GiftCodeExpiryInPastError()
    }

    const existing = yield* repo.findByCode(data.code)
    if (existing) {
      return yield* new GiftCodeDuplicateError()
    }

    return yield* repo.create({
      code: data.code,
      duration: data.duration,
      maxUsages: data.maxUsages,
      expiresAt: data.expiresAt ?? null,
    })
  }).pipe(
    Effect.withSpan('AdminService.createGiftCode', {
      attributes: { 'giftCode.code': data.code },
    })
  )
