import type { CreateSubscriptionData } from '@lily/api/repositories/subscription.repository'
import { INFINITE_END } from '@lily/api/services/helpers/gift-duration'
import type { userSubscriptions } from '@lily/db/schema'
import type {
  AppStore,
  RevenueCatEnvironment,
  RevenueCatSubscriberInfo,
  RevenueCatSubscriberSubscription,
  SubscriptionEventType,
  SubscriptionStatus,
} from '@lily/shared'
import {
  Array,
  DateTime,
  Match,
  Option,
  Order,
  pipe,
  Record,
  String,
} from 'effect'

type SubscriptionRow = typeof userSubscriptions.$inferSelect

// What the store currently says about one user, reduced to the columns of
// `user_subscriptions`. Built from the RevenueCat REST subscriber, never from
// a single webhook event, so it is the same whatever order events arrive in.
export interface StoreSubscriptionState {
  readonly status: SubscriptionStatus
  readonly productId: string
  readonly store: AppStore | null
  readonly periodStart: Date
  readonly periodEnd: Date
  readonly trialStartsAt: Date | null
  readonly trialEndsAt: Date | null
  readonly canceledAt: Date | null
  readonly externalCustomerId: string
}

// Webhook events spell stores "APP_STORE"; the REST API spells them "app_store".
export const mapRevenueCatStore = (store: string): AppStore | null =>
  pipe(
    Match.value(String.toUpperCase(store)),
    Match.when('APP_STORE', () => 'APP_STORE' as const),
    Match.when('PLAY_STORE', () => 'PLAY_STORE' as const),
    Match.orElse(() => null)
  )

const parseDate = (
  iso: string | null | undefined
): Option.Option<DateTime.Utc> =>
  pipe(Option.fromNullishOr(iso), Option.flatMap(DateTime.make))

interface Candidate {
  readonly productId: string
  readonly subscription: RevenueCatSubscriberSubscription
  readonly periodStart: DateTime.Utc
  readonly periodEnd: DateTime.Utc
}

const byPeriodEnd = Order.mapInput(
  DateTime.Order,
  (candidate: Candidate) => candidate.periodEnd
)

const deriveStatus = (
  candidate: Candidate,
  now: DateTime.Utc
): SubscriptionStatus =>
  pipe(
    Match.value({
      expired: DateTime.isLessThanOrEqualTo(candidate.periodEnd, now),
      billingIssue: candidate.subscription.billing_issues_detected_at !== null,
      unsubscribed: candidate.subscription.unsubscribe_detected_at !== null,
      trial: isTrial(candidate.subscription),
    }),
    Match.when({ expired: true }, () => 'expired' as const),
    Match.when({ billingIssue: true }, () => 'past_due' as const),
    Match.when({ unsubscribed: true }, () => 'canceled' as const),
    Match.when({ trial: true }, () => 'trialing' as const),
    Match.orElse(() => 'active' as const)
  )

const isTrial = (subscription: RevenueCatSubscriberSubscription): boolean =>
  pipe(
    Option.fromNullishOr(subscription.period_type),
    Option.map(String.toUpperCase),
    Option.exists((periodType) => periodType === 'TRIAL')
  )

/**
 * The subscription that grants access the longest, among those bought in the
 * deployment's environment. None when the subscriber never bought one there.
 */
export const deriveStoreState = (
  info: RevenueCatSubscriberInfo,
  environment: RevenueCatEnvironment,
  now: DateTime.Utc
): Option.Option<StoreSubscriptionState> =>
  pipe(
    Record.toEntries(info.subscriber.subscriptions),
    Array.filter(
      ([, subscription]) =>
        subscription.is_sandbox === (environment === 'SANDBOX')
    ),
    Array.map(([productId, subscription]) =>
      pipe(
        parseDate(subscription.purchase_date),
        Option.map(
          (periodStart): Candidate => ({
            productId,
            subscription,
            periodStart,
            periodEnd: pipe(
              parseDate(subscription.expires_date),
              Option.getOrElse(() => INFINITE_END)
            ),
          })
        )
      )
    ),
    Array.getSomes,
    (candidates) =>
      Array.isReadonlyArrayNonEmpty(candidates)
        ? Option.some(Array.max(candidates, byPeriodEnd))
        : Option.none(),
    Option.map((candidate) => {
      const trial = isTrial(candidate.subscription)
      const periodStart = DateTime.toDateUtc(candidate.periodStart)
      const periodEnd = DateTime.toDateUtc(candidate.periodEnd)
      return {
        status: deriveStatus(candidate, now),
        productId: candidate.productId,
        store: mapRevenueCatStore(candidate.subscription.store),
        periodStart,
        periodEnd,
        trialStartsAt: trial ? periodStart : null,
        trialEndsAt: trial ? periodEnd : null,
        canceledAt: pipe(
          parseDate(candidate.subscription.unsubscribe_detected_at),
          Option.map(DateTime.toDateUtc),
          Option.getOrNull
        ),
        externalCustomerId: info.subscriber.original_app_user_id,
      }
    })
  )

export type StoreSyncDecision =
  | { readonly _tag: 'KeepGift' }
  | { readonly _tag: 'Unchanged' }
  | { readonly _tag: 'Write'; readonly eventType: SubscriptionEventType }

// Admin gifts and redeemed codes live in the same row with no external id.
const isLiveGift = (row: SubscriptionRow, now: DateTime.Utc): boolean =>
  row.externalSubscriptionId === null &&
  row.tier === 'paid' &&
  DateTime.isGreaterThan(DateTime.makeUnsafe(row.currentPeriodEnd), now)

const sameInstant = (a: Date | null, b: Date | null): boolean =>
  a === null || b === null ? a === b : a.getTime() === b.getTime()

const matchesRow = (
  row: SubscriptionRow,
  write: CreateSubscriptionData
): boolean =>
  row.tier === write.tier &&
  row.status === write.status &&
  row.productId === write.productId &&
  row.store === write.store &&
  row.externalSubscriptionId === write.externalSubscriptionId &&
  row.externalCustomerId === write.externalCustomerId &&
  sameInstant(row.currentPeriodStart, write.currentPeriodStart) &&
  sameInstant(row.currentPeriodEnd, write.currentPeriodEnd) &&
  sameInstant(
    row.trialStartsAt,
    Option.getOrNull(Option.fromNullishOr(write.trialStartsAt))
  ) &&
  sameInstant(
    row.trialEndsAt,
    Option.getOrNull(Option.fromNullishOr(write.trialEndsAt))
  ) &&
  sameInstant(
    row.canceledAt,
    Option.getOrNull(Option.fromNullishOr(write.canceledAt))
  )

const eventTypeFor = (
  previous: SubscriptionRow | null,
  status: SubscriptionStatus
): SubscriptionEventType =>
  pipe(
    Match.value({
      created: previous === null,
      status,
      changed: previous?.status !== status,
    }),
    Match.when({ created: true }, () => 'subscription_created' as const),
    Match.when(
      { status: 'canceled', changed: true },
      () => 'subscription_canceled' as const
    ),
    Match.when(
      { status: 'past_due', changed: true },
      () => 'payment_failed' as const
    ),
    Match.orElse(() => 'subscription_updated' as const)
  )

export const toSubscriptionWrite = (
  userId: string,
  state: StoreSubscriptionState,
  externalSubscriptionId: string | null
): CreateSubscriptionData => ({
  userId,
  tier: 'paid',
  status: state.status,
  trialStartsAt: state.trialStartsAt,
  trialEndsAt: state.trialEndsAt,
  currentPeriodStart: state.periodStart,
  currentPeriodEnd: state.periodEnd,
  canceledAt: state.canceledAt,
  externalSubscriptionId,
  externalCustomerId: state.externalCustomerId,
  provider: 'revenuecat',
  productId: state.productId,
  store: state.store,
})

/**
 * A live gift keeps the row unless the store grants access for longer: the
 * row then carries whichever of the two reaches further, and access is read
 * from the row alone.
 */
export const decideStoreSync = (
  existing: SubscriptionRow | null,
  write: CreateSubscriptionData,
  now: DateTime.Utc
): StoreSyncDecision => {
  if (existing === null) {
    return { _tag: 'Write', eventType: eventTypeFor(null, write.status) }
  }
  if (
    isLiveGift(existing, now) &&
    existing.currentPeriodEnd.getTime() >= write.currentPeriodEnd.getTime()
  ) {
    return { _tag: 'KeepGift' }
  }
  if (matchesRow(existing, write)) {
    return { _tag: 'Unchanged' }
  }
  return { _tag: 'Write', eventType: eventTypeFor(existing, write.status) }
}
