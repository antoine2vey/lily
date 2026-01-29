import type { SubscriptionStatus } from '@lily/shared'
import { Match, pipe } from 'effect'

// Helper to map RevenueCat store to our store type
export const mapRevenueCatStore = (
  store: string
): 'APP_STORE' | 'PLAY_STORE' | null =>
  pipe(
    Match.value(store),
    Match.when('APP_STORE', () => 'APP_STORE' as const),
    Match.when('PLAY_STORE', () => 'PLAY_STORE' as const),
    Match.orElse(() => null)
  )

// Helper to map RevenueCat event type to subscription status
export const mapEventToStatus = (
  eventType: string,
  periodType: string | null | undefined
): SubscriptionStatus =>
  pipe(
    Match.value(eventType),
    Match.when('INITIAL_PURCHASE', () =>
      periodType === 'TRIAL' ? ('trialing' as const) : ('active' as const)
    ),
    Match.when('RENEWAL', () => 'active' as const),
    Match.when('CANCELLATION', () => 'canceled' as const),
    Match.when('UNCANCELLATION', () => 'active' as const),
    Match.when('EXPIRATION', () => 'expired' as const),
    Match.when('BILLING_ISSUE', () => 'past_due' as const),
    Match.when('PRODUCT_CHANGE', () => 'active' as const),
    Match.orElse(() => 'active' as const)
  )

// Type for parsed webhook event data that handlers receive
export interface WebhookEventContext {
  readonly userId: string
  readonly productId: string
  readonly store: 'APP_STORE' | 'PLAY_STORE' | null
  readonly status: SubscriptionStatus
  readonly purchasedAt: Date
  readonly expiresAt: Date
  readonly eventData: {
    readonly type: string
    readonly period_type?: string | null | undefined
    readonly cancel_reason?: string | null | undefined
    readonly original_transaction_id?: string | null | undefined
    readonly id: string
    readonly original_app_user_id: string
    readonly store: string
  }
}
