import type { SqlError } from '@effect/sql/SqlError'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { AdminUser } from '@lily/api/services/admin/middleware.types'
import { nowAsDate } from '@lily/shared'
import type {
  AdminGiftSubscriptionResponse,
  GiftDuration,
} from '@lily/shared/admin'
import { CannotModifySelfError } from '@lily/shared/errors/admin'
import { UserNotFoundError } from '@lily/shared/errors/user'
import { Effect, Match, pipe } from 'effect'

const daysToAdd = (duration: GiftDuration): number | null =>
  pipe(
    Match.value(duration),
    Match.when('7d', () => 7),
    Match.when('1m', () => 30),
    Match.when('1y', () => 365),
    Match.when('infinite', () => null),
    Match.exhaustive
  )

const computePeriodEnd = (duration: GiftDuration, from: Date): Date => {
  const days = daysToAdd(duration)
  if (days === null) {
    return new Date(Date.UTC(2099, 11, 31))
  }
  const end = new Date(from.getTime())
  end.setDate(end.getDate() + days)
  return end
}

export const giftSubscription = (
  userId: string,
  duration: GiftDuration
): Effect.Effect<
  AdminGiftSubscriptionResponse,
  SqlError | UserNotFoundError | CannotModifySelfError,
  UserRepository | SubscriptionRepository | AdminUser
> =>
  Effect.gen(function* () {
    const userRepo = yield* UserRepository
    const subRepo = yield* SubscriptionRepository
    const currentAdmin = yield* AdminUser

    if (userId === currentAdmin.id) {
      return yield* new CannotModifySelfError()
    }

    const user = yield* userRepo.findById(userId)
    if (!user) {
      return yield* new UserNotFoundError()
    }

    const periodStart = nowAsDate()
    const periodEnd = computePeriodEnd(duration, periodStart)

    yield* Effect.all(
      [
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
      ],
      { concurrency: 'unbounded' }
    )

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
