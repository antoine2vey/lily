import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { Alerter, logAndAlertWarning } from '@lily/api/services/alerting'
import { recordNotificationAt } from '@lily/api/services/helpers/schedule-notification'
import { resolveTierConfig } from '@lily/api/services/subscriptions/effective-tier'
import { limitsDisabled } from '@lily/api/services/subscriptions/limits-config'
import type { LanguageCode } from '@lily/shared'
import {
  DEFAULT_TIMEZONE,
  LimitExceededError,
  pickNotificationTime,
  type SubscriptionUsage,
  type UsageField,
} from '@lily/shared'
import {
  Context,
  Effect,
  Exit,
  type Fiber,
  Layer,
  Match,
  Option,
  pipe,
  Random,
} from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

// 80% threshold for approaching-limit notification
const APPROACHING_LIMIT_THRESHOLD = 0.8

const usageFieldMeta = (field: UsageField) =>
  pipe(
    Match.value(field),
    Match.when('aiChats', () => ({
      countKey: 'aiChatsCount' as const,
      limitKey: 'maxAiChatsMonthly' as const,
      feature: 'ai_chats' as const,
      featureNameEn: 'AI chats',
      featureNameFr: 'discussions IA',
      limitMessage: (limit: number) =>
        `You've used all ${limit} AI chats this month. Upgrade to Premium for unlimited AI features!`,
    })),
    Match.when('cardScans', () => ({
      countKey: 'cardScansCount' as const,
      limitKey: 'maxCardScansMonthly' as const,
      feature: 'card_scans' as const,
      featureNameEn: 'card scans',
      featureNameFr: 'scans de cartes',
      limitMessage: (limit: number) =>
        `You've used all ${limit} card scans this month. Upgrade to Premium for unlimited scans!`,
    })),
    Match.when('plantIdentifies', () => ({
      countKey: 'plantIdentifiesCount' as const,
      limitKey: 'maxPlantIdentifiesMonthly' as const,
      feature: 'plant_identifies' as const,
      featureNameEn: 'plant identifications',
      featureNameFr: 'identifications de plantes',
      limitMessage: (limit: number) =>
        `You've used all ${limit} plant identifications this month. Upgrade to Premium for unlimited AI features!`,
    })),
    Match.exhaustive
  )

/**
 * One unit of monthly usage, already counted. `release` gives it back when
 * the work it paid for did not happen.
 */
export interface UsageReservation {
  readonly usage: SubscriptionUsage
  readonly release: Effect.Effect<void, SqlError>
}

/** Whether a metered unit of work is paid for or given back. */
export type Billing = 'charge' | 'refund'

/**
 * A metered unit of work whose result outlives the request that started it.
 *
 * `start` runs in the caller and is interruptible. `work` runs in the fiber
 * `detach` returns and is the only interruptible part of it. `bill` turns
 * the exit of `work` into a `Billing` and runs uninterruptible, so whatever
 * it commits matches the bill.
 */
export interface DetachedTurn<A, E, R, W, WE, RW> {
  readonly start: Effect.Effect<A, E, R>
  readonly work: (started: A) => Effect.Effect<W, WE, RW>
  readonly bill: (exit: Exit.Exit<W, WE>) => Effect.Effect<Billing, never, RW>
  readonly detach: (
    turn: Effect.Effect<Billing>
  ) => Effect.Effect<Fiber.Fiber<Billing>>
}

export interface DetachedReservation<A> {
  readonly started: A
  readonly settled: Fiber.Fiber<Billing>
}

export interface IUsageTracker {
  readonly reserve: (
    userId: string,
    field: UsageField
  ) => Effect.Effect<UsageReservation, LimitExceededError | SqlError>

  /**
   * Reserves one unit, runs `body`, and releases the unit again unless
   * `body` succeeds.
   */
  readonly withReservation: <A, E, R>(
    userId: string,
    field: UsageField,
    body: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E | LimitExceededError | SqlError, R>

  /**
   * Reserves one unit for `turn` and settles it exactly once, in the fiber
   * `detach` returns. The unit is refunded when `start` fails or is
   * interrupted, when `work` is interrupted, when `bill` answers `'refund'`,
   * or when `bill` dies; a dying `bill` still fails `settled` with its cause.
   */
  readonly withDetachedReservation: <A, E, R, W, WE, RW>(
    userId: string,
    field: UsageField,
    turn: DetachedTurn<A, E, R, W, WE, RW>
  ) => Effect.Effect<
    DetachedReservation<A>,
    E | LimitExceededError | SqlError,
    R | RW
  >
}

export class UsageTracker extends Context.Service<
  UsageTracker,
  IUsageTracker
>()('UsageTracker') {}

export const UsageTrackerLive = Layer.effect(
  UsageTracker,
  Effect.gen(function* () {
    const subRepo = yield* SubscriptionRepository
    const notificationRepo = yield* NotificationRepository
    const userRepo = yield* UserRepository
    const alerter = yield* Alerter
    const unlimited = yield* limitsDisabled

    const checkApproachingLimit = (
      userId: string,
      field: UsageField,
      usage: SubscriptionUsage,
      max: number
    ) =>
      Effect.gen(function* () {
        const meta = usageFieldMeta(field)
        const current = usage[meta.countKey]
        const threshold = Math.ceil(max * APPROACHING_LIMIT_THRESHOLD)

        // Only fire when we exactly cross the threshold (not on every
        // subsequent increment)
        if (current !== threshold) return

        const alreadySent =
          yield* notificationRepo.hasNotificationOfTypeTodayForUser(
            userId,
            'UTC',
            'approaching_limit'
          )
        if (alreadySent) return

        const user = yield* userRepo.findById(userId)
        if (!user) return

        const timezone = Option.getOrElse(
          Option.fromNullishOr(user.timezone),
          () => DEFAULT_TIMEZONE
        )
        const language = Option.getOrElse(
          Option.fromNullishOr(user.language),
          () => 'en' as const
        ) as LanguageCode
        const featureName =
          language === 'fr' ? meta.featureNameFr : meta.featureNameEn

        const randomValue = yield* Random.next
        const scheduledAt = yield* Effect.catchTag(
          pickNotificationTime(
            userId,
            timezone,
            user.doNotDisturb,
            user.doNotDisturbStart,
            user.doNotDisturbEnd,
            randomValue
          ),
          'DndWindowBlockedError',
          () => Effect.succeed(new Date())
        )

        yield* recordNotificationAt(
          'approaching_limit',
          userId,
          { usageCount: current, usageMax: max, featureName },
          language,
          {},
          { scheduledAt }
        ).pipe(Effect.provideService(NotificationRepository, notificationRepo))
      }).pipe(
        Effect.catchTags({
          SqlError: (e) =>
            logAndAlertWarning(
              alerter,
              'usage-tracker',
              'Failed to check approaching_limit',
              { userId, field, error: String(e).slice(0, 200) }
            ),
        })
      )

    const reserve = Effect.fn('UsageTracker.reserve')(function* (
      userId: string,
      field: UsageField
    ) {
      const meta = usageFieldMeta(field)
      const limit = unlimited
        ? null
        : (yield* resolveTierConfig(subRepo, userId))[meta.limitKey]

      const usage = yield* subRepo.reserveUsage(userId, field, limit)

      if (usage === null) {
        return yield* pipe(
          Option.fromNullishOr(limit),
          Option.match({
            onNone: () =>
              Effect.die(new Error('reserveUsage refused without a limit')),
            onSome: (max) =>
              new LimitExceededError({
                feature: meta.feature,
                limit: max,
                current: max,
                message: meta.limitMessage(max),
              }),
          })
        )
      }

      if (limit !== null) {
        yield* Effect.forkDetach(
          checkApproachingLimit(userId, field, usage, limit)
        )
      }

      const release = subRepo.releaseUsage(usage.id, field)
      return { usage, release } satisfies UsageReservation
    })

    const refund = (
      reservation: UsageReservation,
      userId: string,
      field: UsageField
    ) =>
      reservation.release.pipe(
        Effect.catchTag('SqlError', (error) =>
          Effect.logError('Failed to release usage reservation', {
            userId,
            field,
            error: String(error),
          })
        )
      )

    const withReservation = <A, E, R>(
      userId: string,
      field: UsageField,
      body: Effect.Effect<A, E, R>
    ) =>
      Effect.acquireUseRelease(
        reserve(userId, field),
        () => body,
        (reservation, exit) =>
          Exit.isSuccess(exit)
            ? Effect.void
            : refund(reservation, userId, field)
      )

    const withDetachedReservation = <A, E, R, W, WE, RW>(
      userId: string,
      field: UsageField,
      turn: DetachedTurn<A, E, R, W, WE, RW>
    ) =>
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const reservation = yield* reserve(userId, field)
          const started = yield* restore(turn.start).pipe(
            Effect.onError(() => refund(reservation, userId, field))
          )
          const context = yield* Effect.context<RW>()

          // The detached fiber does not inherit this mask, so it gets its own.
          const settle = Effect.uninterruptibleMask((restoreWork) =>
            Effect.gen(function* () {
              const exit = yield* Effect.exit(restoreWork(turn.work(started)))
              if (Exit.hasInterrupts(exit)) {
                yield* refund(reservation, userId, field)
                return 'refund' as const
              }
              const billing = yield* turn.bill(exit).pipe(
                Effect.onError((cause) =>
                  Effect.logError('Billing a usage reservation crashed', {
                    userId,
                    field,
                    cause: String(cause),
                  }).pipe(Effect.andThen(refund(reservation, userId, field)))
                )
              )
              if (billing === 'refund') {
                yield* refund(reservation, userId, field)
              }
              return billing
            })
          )

          const settled = yield* turn.detach(Effect.provide(settle, context))
          return { started, settled } satisfies DetachedReservation<A>
        })
      )

    return { reserve, withReservation, withDetachedReservation }
  })
)
