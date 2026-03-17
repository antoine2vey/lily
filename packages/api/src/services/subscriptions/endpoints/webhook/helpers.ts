import type { SqlError } from '@effect/sql/SqlError'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import type {
  RevenueCatEventType,
  RevenueCatPeriodType,
  RevenueCatStore,
  SubscriptionStatus,
} from '@lily/shared'
import { Effect, Match, Option, pipe } from 'effect'

// Helper to map RevenueCat store to our store type
export const mapRevenueCatStore = (
  store: RevenueCatStore
): 'APP_STORE' | 'PLAY_STORE' | null =>
  pipe(
    Match.value(store),
    Match.when('APP_STORE', () => 'APP_STORE' as const),
    Match.when('PLAY_STORE', () => 'PLAY_STORE' as const),
    Match.orElse(() => null)
  )

// Helper to map RevenueCat event type to subscription status
export const mapEventToStatus = (
  eventType: RevenueCatEventType,
  periodType: RevenueCatPeriodType | null | undefined
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

/**
 * Ensure a subscription exists for the user — update if present, create if
 * missing.  Shared across RENEWAL, UNCANCELLATION, and similar handlers.
 */
export const ensureSubscriptionActive = (
  ctx: WebhookEventContext,
  eventType: RevenueCatEventType,
  updateFields: Record<string, unknown> = {}
): Effect.Effect<void, SqlError, SubscriptionRepository> =>
  Effect.gen(function* () {
    const subRepo = yield* SubscriptionRepository
    const existingSub = yield* subRepo.findByUserId(ctx.userId)

    if (existingSub) {
      yield* subRepo.updateByUserId(ctx.userId, {
        status: 'active',
        ...updateFields,
      })
      yield* subRepo.logEvent(ctx.userId, 'subscription_updated', {
        status: 'active',
        eventType,
      })
    } else {
      yield* subRepo.create({
        userId: ctx.userId,
        tier: 'paid',
        status: 'active',
        trialStartsAt: null,
        trialEndsAt: null,
        currentPeriodStart: ctx.purchasedAt,
        currentPeriodEnd: ctx.expiresAt,
        externalSubscriptionId: pipe(
          Option.fromNullable(ctx.eventData.original_transaction_id),
          Option.getOrElse(() => ctx.eventData.id)
        ),
        externalCustomerId: ctx.eventData.original_app_user_id,
        provider: 'revenuecat',
        productId: ctx.productId,
        store: ctx.store,
      })
      yield* subRepo.logEvent(ctx.userId, 'subscription_created', {
        tier: 'paid',
        status: 'active',
        eventType,
        note: `Created from ${eventType} event (subscription was missing)`,
      })
    }
  })

// Type for parsed webhook event data that handlers receive
export interface WebhookEventContext {
  readonly userId: string
  readonly productId: string
  readonly store: 'APP_STORE' | 'PLAY_STORE' | null
  readonly status: SubscriptionStatus
  readonly purchasedAt: Date
  readonly expiresAt: Date
  readonly eventData: {
    readonly type: RevenueCatEventType
    readonly period_type?: RevenueCatPeriodType | null | undefined
    readonly cancel_reason?: string | null | undefined
    readonly original_transaction_id?: string | null | undefined
    readonly id: string
    readonly original_app_user_id: string
    readonly store: RevenueCatStore
  }
}
