import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { createMockSubscriptionRepository } from '@lily/api/__tests__/mocks/subscription.repository'
import {
  type INotificationRepository,
  NotificationRepository,
} from '@lily/api/repositories/notification.repository'
import {
  type IUserRepository,
  UserRepository,
} from '@lily/api/repositories/user.repository'
import {
  type UsageTracker,
  UsageTrackerLive,
} from '@lily/api/services/subscriptions/usage-tracker'
import type { subscriptionUsage } from '@lily/db/schema'
import type { UsageField } from '@lily/shared'
import { Effect, Layer } from 'effect'

interface MockUsageTrackerOptions {
  limitReached?: boolean | undefined
  onReserve?: ((field: UsageField) => void) | undefined
  onRelease?: ((field: UsageField) => void) | undefined
}

const freeLimitsReached: typeof subscriptionUsage.$inferSelect = {
  id: 'usage-1',
  userId: 'user-1',
  periodStart: new Date(),
  periodEnd: new Date(),
  aiChatsCount: Number.MAX_SAFE_INTEGER,
  cardScansCount: Number.MAX_SAFE_INTEGER,
  plantIdentifiesCount: Number.MAX_SAFE_INTEGER,
  createdAt: new Date(),
  updatedAt: new Date(),
}

export const createMockUsageTracker = (
  options: MockUsageTrackerOptions = {}
): Layer.Layer<UsageTracker> => {
  const notifRepo = new Proxy({} as INotificationRepository, {
    get: () => () => Effect.succeed(null),
  })
  const userRepo = new Proxy({} as IUserRepository, {
    get: () => () => Effect.succeed(null),
  })

  return UsageTrackerLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        MockAlerterLive,
        createMockSubscriptionRepository({
          usage: options.limitReached ? freeLimitsReached : undefined,
          onReserveUsage: (_userId, field) => options.onReserve?.(field),
          onReleaseUsage: (_usageId, field) => options.onRelease?.(field),
        }),
        Layer.succeed(NotificationRepository, notifRepo),
        Layer.succeed(UserRepository, userRepo)
      )
    ),
    Layer.orDie
  )
}

export const MockUsageTrackerLive = createMockUsageTracker()
