import type { userSubscriptions } from '@lily/db'
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
    Match.when('active', () => true),
    Match.when('trialing', () => isWithinBillingPeriod),
    Match.when('canceled', () => isWithinBillingPeriod),
    Match.when('past_due', () => isWithinBillingPeriod),
    Match.when('expired', () => false),
    Match.exhaustive
  )
}
