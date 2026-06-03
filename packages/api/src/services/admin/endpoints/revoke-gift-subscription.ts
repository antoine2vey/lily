import type { SqlError } from '@effect/sql/SqlError'
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
import type { UserNotFoundError } from '@lily/shared/errors/user'
import { Effect } from 'effect'

export const revokeGiftSubscription = (
  userId: string
): Effect.Effect<
  AdminRevokeGiftResponse,
  | SqlError
  | UserNotFoundError
  | CannotModifySelfError
  | StorePayerProtectedError,
  UserRepository | SubscriptionRepository | AdminUser
> =>
  Effect.gen(function* () {
    const { user, currentAdmin } = yield* withAdminTarget(userId)
    // A store payer has no admin gift to revoke; refuse to overwrite their row.
    yield* assertNotStorePayer(userId)
    const subRepo = yield* SubscriptionRepository
    const now = nowAsDate()

    yield* Effect.all(
      [
        subRepo.updateByUserId(userId, {
          tier: 'free',
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: now,
        }),
        subRepo.logEvent(userId, 'subscription_gift_revoked', {
          revokedBy: currentAdmin.id,
        }),
      ],
      { concurrency: 'unbounded' }
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
