import type { SqlError } from '@effect/sql/SqlError'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { buildSimpleContent } from '@lily/api/services/notification-scheduler/translations'
import { hasPremiumAccess } from '@lily/api/services/subscriptions/has-premium-access'
import type { LanguageCode } from '@lily/shared'
import {
  DEFAULT_TIMEZONE,
  pickNotificationTime,
  type SubscriptionUsage,
  type UsageField,
} from '@lily/shared'
import { Context, Effect, Layer, Match, Option, pipe, Random } from 'effect'

// 80% threshold for approaching-limit notification
const APPROACHING_LIMIT_THRESHOLD = 0.8

// Map UsageField to the corresponding count property and feature name
const usageFieldMeta = (field: UsageField) =>
  pipe(
    Match.value(field),
    Match.when('aiChats', () => ({
      countKey: 'aiChatsCount' as const,
      limitKey: 'maxAiChatsMonthly' as const,
      featureNameEn: 'AI chats',
      featureNameFr: 'discussions IA',
    })),
    Match.when('cardScans', () => ({
      countKey: 'cardScansCount' as const,
      limitKey: 'maxCardScansMonthly' as const,
      featureNameEn: 'card scans',
      featureNameFr: 'scans de cartes',
    })),
    Match.when('plantIdentifies', () => ({
      countKey: 'plantIdentifiesCount' as const,
      limitKey: 'maxPlantIdentifiesMonthly' as const,
      featureNameEn: 'plant identifications',
      featureNameFr: 'identifications de plantes',
    })),
    Match.exhaustive
  )

export interface IUsageTracker {
  readonly trackAiChat: (
    userId: string
  ) => Effect.Effect<SubscriptionUsage | null, SqlError>

  readonly trackCardScan: (
    userId: string
  ) => Effect.Effect<SubscriptionUsage | null, SqlError>

  readonly trackPlantIdentify: (
    userId: string
  ) => Effect.Effect<SubscriptionUsage | null, SqlError>
}

export class UsageTracker extends Context.Tag('UsageTracker')<
  UsageTracker,
  IUsageTracker
>() {}

export const UsageTrackerLive = Layer.effect(
  UsageTracker,
  Effect.gen(function* () {
    const subRepo = yield* SubscriptionRepository
    const notificationRepo = yield* NotificationRepository
    const userRepo = yield* UserRepository

    // Check if usage crossed the 80% threshold and create notification
    const checkApproachingLimit = (
      userId: string,
      field: UsageField,
      usage: SubscriptionUsage | null
    ) =>
      Effect.gen(function* () {
        if (!usage) return

        // Only for free tier users
        const subscription = yield* subRepo.findByUserId(userId)
        const isPremium = pipe(
          Option.fromNullable(subscription),
          Option.filter(hasPremiumAccess),
          Option.isSome
        )
        if (isPremium) return

        const tierConfig = yield* subRepo.getTier('free')
        const meta = usageFieldMeta(field)
        const max = tierConfig[meta.limitKey]
        if (max === null) return

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
          Option.fromNullable(user.timezone),
          () => DEFAULT_TIMEZONE
        )
        const language = Option.getOrElse(
          Option.fromNullable(user.language),
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
            Effect.logWarning(
              '[usage-tracker] Failed to check approaching_limit',
              { userId, field, error: String(e) }
            ),
        })
      )

    const trackAndCheck = (userId: string, field: UsageField) =>
      Effect.gen(function* () {
        const usage = yield* subRepo.incrementUsage(userId, field)
        yield* Effect.forkDaemon(checkApproachingLimit(userId, field, usage))
        return usage
      })

    return {
      trackAiChat: (userId: string) => trackAndCheck(userId, 'aiChats'),

      trackCardScan: (userId: string) => trackAndCheck(userId, 'cardScans'),

      trackPlantIdentify: (userId: string) =>
        trackAndCheck(userId, 'plantIdentifies'),
    }
  })
)
