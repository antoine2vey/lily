import type { SqlError } from '@effect/sql/SqlError'
import {
  type GiftCodeRecord,
  GiftCodeRepository,
} from '@lily/api/repositories/gift-code.repository'
import { GiftCodeNotFoundError } from '@lily/shared/errors/gift-code'
import { Effect } from 'effect'

export const deleteGiftCode = (
  codeId: string
): Effect.Effect<
  GiftCodeRecord,
  SqlError | GiftCodeNotFoundError,
  GiftCodeRepository
> =>
  Effect.gen(function* () {
    const repo = yield* GiftCodeRepository

    const deleted = yield* repo.remove(codeId)
    if (!deleted) {
      return yield* new GiftCodeNotFoundError()
    }

    return deleted
  }).pipe(
    Effect.withSpan('AdminService.deleteGiftCode', {
      attributes: { 'giftCode.id': codeId },
    })
  )
