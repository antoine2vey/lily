import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import { assertNotStorePayer } from '@lily/api/services/admin/helpers/assert-not-store-payer'
import { withAdminTarget } from '@lily/api/services/admin/helpers/with-admin-target'
import type { AdminUser } from '@lily/api/services/admin/middleware.types'
import { computePeriodEnd } from '@lily/api/services/helpers/gift-duration'
import {
  dispatchNow,
  recordNotification,
} from '@lily/api/services/helpers/schedule-notification'
import {
  type AdminGiftSubscriptionResponse,
  GIFT_DURATION_LABELS,
  type GiftDuration,
} from '@lily/shared/admin'
import type {
  CannotModifySelfError,
  StorePayerProtectedError,
} from '@lily/shared/errors/admin'
import type { UserNotFoundError } from '@lily/shared/errors/user'
import type { MessageQueue } from '@lily/shared/server'
import { DateTime, Effect, Option, pipe } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export const giftSubscription = (
  userId: string,
  duration: GiftDuration
): Effect.Effect<
  AdminGiftSubscriptionResponse,
  | SqlError
  | UserNotFoundError
  | CannotModifySelfError
  | StorePayerProtectedError,
  | UserRepository
  | SubscriptionRepository
  | AdminUser
  | NotificationRepository
  | MessageQueue
  | SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const { user, currentAdmin } = yield* withAdminTarget(userId)
    // Refuse to overwrite a real store-billed subscription (RevenueCat).
    yield* assertNotStorePayer(userId)
    const subRepo = yield* SubscriptionRepository

    const periodStart = DateTime.toDate(DateTime.nowUnsafe())
    const periodEnd = computePeriodEnd(duration)

    const sql = yield* SqlClient.SqlClient
    const [, , notification] = yield* sql.withTransaction(
      Effect.all([
        subRepo.create({
          userId,
          tier: 'paid',
          status: 'active',
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        }),
        subRepo.logEvent(userId, 'subscription_gifted', {
          giftedBy: currentAdmin.id,
          duration,
        }),
        recordNotification(
          'gift_subscription',
          userId,
          {
            giftDuration: pipe(
              Option.fromNullishOr(GIFT_DURATION_LABELS[user.language]),
              Option.flatMap((labels) =>
                Option.fromNullishOr(labels[duration])
              ),
              Option.getOrElse(() => duration)
            ),
          },
          user.language,
          {}
        ),
      ])
    )

    yield* dispatchNow(notification)

    return {
      message: `Gifted ${duration} paid subscription to ${user.name ?? user.email}`,
      userId,
      tier: 'paid' as const,
      status: 'active' as const,
      periodStart,
      periodEnd,
    }
  }).pipe(
    Effect.withSpan('AdminService.giftSubscription', {
      attributes: { 'user.id': userId, 'gift.duration': duration },
    })
  )
