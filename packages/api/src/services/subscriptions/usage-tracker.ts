import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { Alerter, logAndAlertWarning } from '@lily/api/services/alerting'
import { buildSimpleContent } from '@lily/api/services/notification-scheduler/translations'
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

        const { title, body } = buildSimpleContent(
          'approaching_limit',
          {
            usageCount: current,
            usageMax: max,
            featureName,
          },
          language
        )

        yield* notificationRepo.create({
          type: 'approaching_limit',
          title,
          body,
          scheduledAt,
          userId,
        })
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

      const release = subRepo.releaseUsage(userId, field)
      return { usage, release } satisfies UsageReservation
    })

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
            : reservation.release.pipe(
                Effect.catchTag('SqlError', (error) =>
                  Effect.logError('Failed to release usage reservation', {
                    userId,
                    field,
                    error: String(error),
                  })
                )
              )
      )

    return { reserve, withReservation }
  })
)
