import type { userSubscriptions } from '@lily/db/schema'
import { DateTime, Match, pipe } from 'effect'

/**
 * Determines if a subscription grants premium access.
 * Checks both status and billing period to handle webhook lag.
 */
export const hasPremiumAccess = (
  subscription: typeof userSubscriptions.$inferSelect
): boolean => {
  const periodEnd = DateTime.unsafeMake(subscription.currentPeriodEnd)
  const now = DateTime.unsafeNow()
  const isWithinBillingPeriod = DateTime.greaterThan(periodEnd, now)

  return pipe(
    Match.value(subscription.status),
    Match.when('expired', () => false),
    Match.orElse(() => isWithinBillingPeriod)
  )
}

/**
 * A "real store payer" has an active, paid subscription linked to an actual
 * App Store / Play Store purchase (non-null externalSubscriptionId). Admin
 * gifts never set externalSubscriptionId, so this reliably distinguishes a
 * paying customer — whose row must not be clobbered by a gift/revoke upsert —
 * from a gifted or free user. Single source of truth shared by the admin
 * overview display flag and the gift/revoke server-side guard.
 */
export const isStorePayer = (
  subscription: typeof userSubscriptions.$inferSelect | null
): boolean =>
  subscription !== null &&
  subscription.tier === 'paid' &&
  subscription.status === 'active' &&
  subscription.externalSubscriptionId !== null
