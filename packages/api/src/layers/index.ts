import { BunServices } from '@effect/platform-bun'
import { AbsenceLive } from '@lily/api/contexts/absence'
import { CanopyLive } from '@lily/api/contexts/canopy'
import { CareLive, CareReadsLive } from '@lily/api/contexts/care'
import { ReminderStoreLive } from '@lily/api/contexts/reminders'
import { RedisEventBusLive } from '@lily/api/events'
import { AppOutboxLive } from '@lily/api/layers/outbox'
import { AccountPhotoRepositoryLive } from '@lily/api/repositories/account-photo.repository'
import { AchievementRepositoryLive } from '@lily/api/repositories/achievement.repository'
import { ActivityPushTokenRepositoryLive } from '@lily/api/repositories/activity-push-token.repository'
import { AnalyticsRepositoryLive } from '@lily/api/repositories/analytics.repository'
import { BlogPostRepositoryLive } from '@lily/api/repositories/blog-post.repository'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CarePlanRepositoryLive } from '@lily/api/repositories/care-plan.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { ChatRepositoryLive } from '@lily/api/repositories/chat.repository'
import { ChatFollowUpRepositoryLive } from '@lily/api/repositories/chat-follow-up.repository'
import { DailyTipRepositoryLive } from '@lily/api/repositories/daily-tip.repository'
import { DeadLetterRepositoryLive } from '@lily/api/repositories/dead-letter.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { DeviceTokenRepositoryLive } from '@lily/api/repositories/device-token.repository'
import { DiagnosisRepositoryLive } from '@lily/api/repositories/diagnosis.repository'
import { EngagementRepositoryLive } from '@lily/api/repositories/engagement.repository'
import { FollowRepositoryLive } from '@lily/api/repositories/follow.repository'
import { GiftCodeRepositoryLive } from '@lily/api/repositories/gift-code.repository'
import { IngestJobRepositoryLive } from '@lily/api/repositories/ingest-job.repository'
import { MagicLinkRepositoryLive } from '@lily/api/repositories/magic-link.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { NotificationDeliveryLive } from '@lily/api/repositories/notification-delivery.repository'
import { NotificationInboxLive } from '@lily/api/repositories/notification-inbox.repository'
import { OAuthIdentityRepositoryLive } from '@lily/api/repositories/oauth-identity.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { PlantCatalogRepositoryLive } from '@lily/api/repositories/plant-catalog.repository'
import { ProcessedChunkRepositoryLive } from '@lily/api/repositories/processed-chunk.repository'
import { RareIdentificationRepositoryLive } from '@lily/api/repositories/rare-identification.repository'
import { RawDocumentRepositoryLive } from '@lily/api/repositories/raw-document.repository'
import { RefreshTokenRepositoryLive } from '@lily/api/repositories/refresh-token.repository'
import { RoomRepositoryLive } from '@lily/api/repositories/room.repository'
import { ScanRepositoryLive } from '@lily/api/repositories/scan.repository'
import { StoredRefRepositoryLive } from '@lily/api/repositories/stored-ref.repository'
import { SubscriptionRepositoryLive } from '@lily/api/repositories/subscription.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { WeatherRepositoryLive } from '@lily/api/repositories/weather.repository'
import { AchievementNotifierLive } from '@lily/api/services/achievements/notifier'
import { AdminAuthLive } from '@lily/api/services/admin/middleware.impl'
import { AiService } from '@lily/api/services/ai/service'
import { ChatTurns } from '@lily/api/services/ai-chat/chat-turns'
import {
  ConsoleAlerterLive,
  DiscordAlerterLive,
} from '@lily/api/services/alerting'
import { MagicLinkConfigLive } from '@lily/api/services/auth/endpoints/send-magic-link'
import { AuthenticationLive } from '@lily/api/services/auth/middleware.impl'
import { ConsoleEmailServiceLive } from '@lily/api/services/email/console.provider'
import { ResendEmailServiceLive } from '@lily/api/services/email/resend.provider'
import { ServiceAuthenticationLive } from '@lily/api/services/internal/middleware.impl'
import { JWTServiceLive } from '@lily/api/services/jwt/service'
import {
  RedisClientLive,
  RedisMessageQueueLive,
} from '@lily/api/services/message-queue/redis.provider'
import { OAuthVerifierServiceLive } from '@lily/api/services/oauth-verifier/service'
import { ConsolePushServiceLive } from '@lily/api/services/push/console.provider'
import { ExpoPlusApnsPushServiceLive } from '@lily/api/services/push/expo-plus-apns.provider'
import { ExpoPushClient } from '@lily/api/services/push/expo-push-client'
import { PendingPushReceipts } from '@lily/api/services/push/pending-push-receipts'
import { RagService } from '@lily/api/services/rag/service'
import { RateLimiterServiceLive } from '@lily/api/services/rate-limiter/service'
import { LimitCheckerLive } from '@lily/api/services/subscriptions/limit-checker'
import { RevenueCatProviderLive } from '@lily/api/services/subscriptions/providers/revenuecat.provider'
import { UsageTrackerLive } from '@lily/api/services/subscriptions/usage-tracker'
import { WeatherCacheLive } from '@lily/api/services/weather/cache.live'
import { WeatherProviderLive } from '@lily/api/services/weather/provider.live'
import { KnowledgeDrizzleLive } from '@lily/knowledge-db'
import { FileService } from '@lily/shared/services/file/fileservice'
import { GCSService } from '@lily/shared/services/file/gcs'
import { Config, Effect, Layer, Option, Redacted } from 'effect'

export { BunServices } from '@effect/platform-bun'
export { RedisEventBusLive } from '@lily/api/events'
export { AdminAuthLive } from '@lily/api/services/admin/middleware.impl'
export { AiService } from '@lily/api/services/ai/service'
export { AuthenticationLive } from '@lily/api/services/auth/middleware.impl'
export { JWTServiceLive } from '@lily/api/services/jwt/service'
export {
  RedisClientLive,
  RedisMessageQueueLive,
} from '@lily/api/services/message-queue/redis.provider'
export { RateLimiterServiceLive } from '@lily/api/services/rate-limiter/service'
export { LimitCheckerLive } from '@lily/api/services/subscriptions/limit-checker'
export { RevenueCatProviderLive } from '@lily/api/services/subscriptions/providers/revenuecat.provider'
export { UsageTrackerLive } from '@lily/api/services/subscriptions/usage-tracker'
export { FileService } from '@lily/shared/services/file/fileservice'
export { GCSService } from '@lily/shared/services/file/gcs'

// Split into two groups to stay under Layer.mergeAll's 20-argument overload limit
const RepositoriesGroup1 = Layer.mergeAll(
  AccountPhotoRepositoryLive,
  AchievementRepositoryLive,
  BlogPostRepositoryLive,
  CareLogRepositoryLive,
  CareScheduleRepositoryLive,
  ChatRepositoryLive,
  DailyTipRepositoryLive,
  DeadLetterRepositoryLive,
  CanopyRepositoryLive,
  DelegationRepositoryLive,
  DeviceTokenRepositoryLive,
  DiagnosisRepositoryLive,
  EngagementRepositoryLive,
  FollowRepositoryLive,
  IngestJobRepositoryLive,
  MagicLinkRepositoryLive,
  NotificationRepositoryLive,
  PlantRepositoryLive,
  ProcessedChunkRepositoryLive,
  RawDocumentRepositoryLive,
  RefreshTokenRepositoryLive,
  RoomRepositoryLive,
  PlantCatalogRepositoryLive
)

const RepositoriesGroup2 = Layer.mergeAll(
  ActivityPushTokenRepositoryLive,
  CarePlanRepositoryLive,
  AnalyticsRepositoryLive,
  GiftCodeRepositoryLive,
  OAuthIdentityRepositoryLive,
  ScanRepositoryLive,
  RareIdentificationRepositoryLive,
  SubscriptionRepositoryLive,
  UserRepositoryLive,
  WeatherRepositoryLive,
  CareReadsLive,
  ChatFollowUpRepositoryLive,
  StoredRefRepositoryLive,
  NotificationInboxLive,
  NotificationDeliveryLive
)

export const AllRepositoriesLive = Layer.mergeAll(
  RepositoriesGroup1,
  RepositoriesGroup2
)

const NodeEnvConfig = Config.String('NODE_ENV').pipe(
  Config.withDefault('development')
)

const DiscordWebhookConfig = Config.option(
  Config.Redacted('DISCORD_WEBHOOK_URL')
).pipe(
  Config.map((opt) => Option.filter(opt, (r) => Redacted.value(r).length > 0))
)

const AlerterLive = Layer.unwrap(
  Effect.gen(function* () {
    const nodeEnv = yield* NodeEnvConfig
    const webhook = yield* DiscordWebhookConfig
    if (nodeEnv === 'production' && Option.isSome(webhook)) {
      return DiscordAlerterLive
    }
    yield* Effect.log(
      '[alerter] Using console provider (non-production or DISCORD_WEBHOOK_URL not set)'
    )
    return ConsoleAlerterLive
  })
)

// Dev override: `PUSH_PROVIDER=expo` forces real Expo push even when
// NODE_ENV=development. Useful for testing Live Activities on a physical
// device without flipping the whole app into production mode (email stays
// on console). Leave unset to get the usual dev-safe console logging.
const PushProviderOverrideConfig = Config.option(Config.String('PUSH_PROVIDER'))

const ExternalServicesLive = Layer.unwrap(
  Effect.gen(function* () {
    const nodeEnv = yield* NodeEnvConfig
    const pushOverride = yield* PushProviderOverrideConfig

    if (nodeEnv === 'production') {
      return Layer.mergeAll(ExpoPlusApnsPushServiceLive, ResendEmailServiceLive)
    }

    const forceExpoPush = Option.match(pushOverride, {
      onNone: () => false,
      onSome: (v) => v.toLowerCase() === 'expo',
    })
    const pushLayer = forceExpoPush
      ? ExpoPlusApnsPushServiceLive
      : ConsolePushServiceLive

    yield* Effect.log(
      forceExpoPush
        ? '[DEV] PUSH_PROVIDER=expo → Expo (regular push) + direct-APNs (Live Activity)'
        : '[DEV] Using console providers for push notifications and email'
    )
    return Layer.mergeAll(pushLayer, ConsoleEmailServiceLive)
  })
)

const SelfContainedInfraLive = Layer.mergeAll(
  AuthenticationLive,
  AdminAuthLive,
  ServiceAuthenticationLive,
  AchievementNotifierLive,
  AiService.layer,
  ChatTurns.layer,
  GCSService.layer,
  FileService.layer,
  RevenueCatProviderLive,
  WeatherProviderLive,
  JWTServiceLive,
  OAuthVerifierServiceLive,
  RateLimiterServiceLive,
  MagicLinkConfigLive
).pipe(Layer.provideMerge(BunServices.layer))

const RedisFullLive = Layer.mergeAll(
  RedisEventBusLive,
  RedisMessageQueueLive,
  WeatherCacheLive,
  PendingPushReceipts.layer
).pipe(Layer.provideMerge(RedisClientLive))

const RepoDependentInfraLive = Layer.mergeAll(
  LimitCheckerLive,
  UsageTrackerLive,
  RagService.layer,
  ExternalServicesLive
)

const AllInfrastructureLive = Layer.mergeAll(
  SelfContainedInfraLive,
  RepoDependentInfraLive
).pipe(
  Layer.provideMerge(Layer.mergeAll(RedisFullLive, ExpoPushClient.layer)),
  Layer.provideMerge(AlerterLive)
)

const ContextsLive = CanopyLive.pipe(
  Layer.provideMerge(AbsenceLive),
  Layer.provideMerge(CareLive),
  Layer.provideMerge(AppOutboxLive),
  Layer.provideMerge(ReminderStoreLive)
)

export const AppLive = ContextsLive.pipe(
  Layer.provideMerge(AllInfrastructureLive),
  Layer.provideMerge(AllRepositoriesLive),
  Layer.provideMerge(KnowledgeDrizzleLive)
)
