import type { SqlError } from '@effect/sql/SqlError'
import { AchievementRepository } from '@lily/api/repositories/achievement.repository'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import { DeviceTokenRepository } from '@lily/api/repositories/device-token.repository'
import { RoomRepository } from '@lily/api/repositories/room.repository'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import { getUser } from '@lily/api/services/admin/endpoints/get-user'
import { getCurrentSubscription } from '@lily/api/services/subscriptions/endpoints/get-current-subscription'
import type { AdminUserOverview } from '@lily/shared/admin'
import type { UserNotFoundError } from '@lily/shared/errors/user'
import { Effect, Option } from 'effect'

// Aggregate read for the admin user-detail page: profile + subscription +
// curated engagement stats in one round-trip. Reuses the existing per-user
// endpoints/repositories (none are caller-scoped — they all take an explicit
// userId), so no new query logic is introduced.
export const getUserOverview = (
  userId: string
): Effect.Effect<
  AdminUserOverview,
  SqlError | UserNotFoundError,
  | UserRepository
  | SubscriptionRepository
  | CareLogRepository
  | AchievementRepository
  | DeviceTokenRepository
  | RoomRepository
> =>
  Effect.gen(function* () {
    const subRepo = yield* SubscriptionRepository
    const careLogRepo = yield* CareLogRepository
    const achievementRepo = yield* AchievementRepository
    const deviceTokenRepo = yield* DeviceTokenRepository
    const roomRepo = yield* RoomRepository

    // Resolve the user first so a missing user short-circuits with 404 before
    // we fan out the (otherwise empty) stat queries.
    const user = yield* getUser(userId)

    const [
      subscription,
      rawSubscription,
      careLogsCount,
      plantCount,
      achievementsCount,
      activeDeviceCount,
      roomsCount,
      recent,
    ] = yield* Effect.all(
      [
        getCurrentSubscription(userId),
        // Raw row carries externalSubscriptionId/store/productId, which the
        // app-facing SubscriptionInfo deliberately omits.
        subRepo.findByUserId(userId),
        careLogRepo.countByUser(userId),
        achievementRepo.countPlants(userId),
        achievementRepo.countByUserId(userId),
        deviceTokenRepo.countActiveByUserId(userId),
        roomRepo.countByUserId(userId),
        // Recent care actions across the user's plants (the app's "recent
        // activity" feed) — same source the mobile home screen uses.
        careLogRepo.findRecentByUserId({ userId, limit: 15 }),
      ],
      { concurrency: 'unbounded' }
    )

    // A real store payer has a RevenueCat-issued externalSubscriptionId; admin
    // gifts never set it. The admin UI uses this to block gifting (which would
    // overwrite the row) for paying customers.
    const isStorePayer =
      rawSubscription != null &&
      rawSubscription.tier === 'paid' &&
      rawSubscription.status === 'active' &&
      rawSubscription.externalSubscriptionId != null

    return {
      user,
      subscription,
      isStorePayer,
      store: Option.getOrNull(Option.fromNullable(rawSubscription?.store)),
      productId: Option.getOrNull(
        Option.fromNullable(rawSubscription?.productId)
      ),
      stats: {
        plantCount,
        careLogsCount,
        achievementsCount,
        activeDeviceCount,
        roomsCount,
      },
      recentActivity: recent.items,
    }
  }).pipe(
    Effect.withSpan('AdminService.getUserOverview', {
      attributes: { 'user.id': userId },
    })
  )
