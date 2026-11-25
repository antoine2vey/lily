import { transactQuietly } from '@lily/api/kernel/transact'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import { assertNotStorePayer } from '@lily/api/services/admin/helpers/assert-not-store-payer'
import { withAdminTarget } from '@lily/api/services/admin/helpers/with-admin-target'
import type { AdminUser } from '@lily/api/services/admin/middleware.types'
import { nowAsDate } from '@lily/shared'
import type { AdminRevokeGiftResponse } from '@lily/shared/admin'
import type {
  CannotModifySelfError,
  StorePayerProtectedError,
} from '@lily/shared/errors/admin'
import { UserNotFoundError } from '@lily/shared/errors/user'
import { Effect } from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export const revokeGiftSubscription = (
  userId: string
): Effect.Effect<
  AdminRevokeGiftResponse,
  | SqlError
  | UserNotFoundError
  | CannotModifySelfError
  | StorePayerProtectedError,
  UserRepository | SubscriptionRepository | AdminUser | SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const { user, currentAdmin } = yield* withAdminTarget(userId)
    // A store payer has no admin gift to revoke; refuse to overwrite their row.
    yield* assertNotStorePayer(userId)
    const subRepo = yield* SubscriptionRepository
    const now = nowAsDate()

    yield* transactQuietly(
      Effect.gen(function* () {
        // Held before the first write, as in `giftSubscription`.
        if (!(yield* subRepo.holdAccount(userId))) {
          return yield* new UserNotFoundError()
        }
        yield* subRepo.updateByUserId(userId, {
          tier: 'free',
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: now,
        })
        yield* subRepo.logEvent(userId, 'subscription_gift_revoked', {
          revokedBy: currentAdmin.id,
        })
      })
    )

    return {
      message: `Revoked gift subscription for ${user.name ?? user.email}`,
      userId,
      tier: 'free' as const,
      status: 'active' as const,
    }
  }).pipe(
    Effect.withSpan('AdminService.revokeGiftSubscription', {
      attributes: { 'user.id': userId },
    })
  )
