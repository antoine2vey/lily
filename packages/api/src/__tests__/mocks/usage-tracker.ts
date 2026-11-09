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
  aiChatsCount: 10,
  cardScansCount: 5,
  plantIdentifiesCount: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
}

/**
 * The real tracker over an in-memory repository, so tests exercise the same
 * reserve, refund and interruption rules production runs.
 */
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
