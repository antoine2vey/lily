import type { SqlError } from '@effect/sql/SqlError'
import {
  type GiftCodeRecord,
  GiftCodeRepository,
} from '@lily/api/repositories/gift-code.repository'
import { GiftCodeNotFoundError } from '@lily/shared/errors/gift-code'
import { Effect } from 'effect'

export const getGiftCode = (
  codeId: string
): Effect.Effect<
  GiftCodeRecord & {
    redemptions: ReadonlyArray<{
      id: string
      giftCodeId: string
      userId: string
      userName: string | null
      userEmail: string
      redeemedAt: Date
    }>
  },
  SqlError | GiftCodeNotFoundError,
  GiftCodeRepository
> =>
  Effect.gen(function* () {
    const repo = yield* GiftCodeRepository

    const [giftCode, redemptions] = yield* Effect.all([
      repo.findById(codeId),
      repo.findRedemptionsByCode(codeId, { page: 1, limit: 100 }),
    ])

    if (!giftCode) {
      return yield* new GiftCodeNotFoundError()
    }

    return {
      ...giftCode,
      redemptions: redemptions.items,
    }
  }).pipe(
    Effect.withSpan('AdminService.getGiftCode', {
      attributes: { 'giftCode.id': codeId },
    })
  )
