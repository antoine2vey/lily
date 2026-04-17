/**
 * Shared Layer Exports & Composite App Layer
 *
 * Re-exports layers from their original locations for convenient importing.
 * Provides `AppLive` — a single composite layer that bundles all repositories
 * and infrastructure, so handlers and schedulers never need their own
 * `Layer.provide` chains.
 *
 * Usage:
 * ```typescript
 * import { AppLive } from '@lily/api/layers'
 * ```
 *
 * ## EventBus vs MessageQueue
 *
 * - **EventBus** (Redis pub/sub, `RedisEventBusLive`): Ephemeral, fire-and-forget.
 *   Used for achievement events — if a subscriber is offline the event is lost.
 *
 * - **MessageQueue** (Redis lists, `RedisMessageQueueLive`): Reliable, at-least-once.
 *   Used for notification delivery — messages persist until consumed.
 */

import { BunContext } from '@effect/platform-bun'
import { RedisEventBusLive } from '@lily/api/events'
import { AchievementRepositoryLive } from '@lily/api/repositories/achievement.repository'
import { AnalyticsRepositoryLive } from '@lily/api/repositories/analytics.repository'
import { BlogPostRepositoryLive } from '@lily/api/repositories/blog-post.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { ChatRepositoryLive } from '@lily/api/repositories/chat.repository'
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
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { PlantCatalogRepositoryLive } from '@lily/api/repositories/plant-catalog.repository'
import { ProcessedChunkRepositoryLive } from '@lily/api/repositories/processed-chunk.repository'
import { RawDocumentRepositoryLive } from '@lily/api/repositories/raw-document.repository'
import { RefreshTokenRepositoryLive } from '@lily/api/repositories/refresh-token.repository'
import { RoomRepositoryLive } from '@lily/api/repositories/room.repository'
import { ScanRepositoryLive } from '@lily/api/repositories/scan.repository'
import { SubscriptionRepositoryLive } from '@lily/api/repositories/subscription.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { WeatherRepositoryLive } from '@lily/api/repositories/weather.repository'
import { AchievementNotifierLive } from '@lily/api/services/achievements/notifier'
import { AdminAuthLive } from '@lily/api/services/admin/middleware.impl'
import { AiService } from '@lily/api/services/ai/service'
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
import { ConsolePushServiceLive } from '@lily/api/services/push/console.provider'
import { ExpoPushServiceLive } from '@lily/api/services/push/expo.provider'
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
import { Config, Effect, Layer } from 'effect'

// ============================================================================
// Re-exports for direct access
// ============================================================================

export { BunContext } from '@effect/platform-bun'
export { RedisEventBusLive } from '@lily/api/events'
export { AdminAuthLive } from '@lily/api/services/admin/middleware.impl'
export { AiService } from '@lily/api/services/ai/service'
export { AuthenticationLive } from '@lily/api/services/auth/middleware.impl'
export { JWTServiceLive } from '@lily/api/services/jwt/service'
export {
  RedisClientLive,
  RedisMessageQueueLive,
} from '@lily/api/services/message-queue/redis.provider'
export { ExpoPushServiceLive } from '@lily/api/services/push/expo.provider'
export { RateLimiterServiceLive } from '@lily/api/services/rate-limiter/service'
export { LimitCheckerLive } from '@lily/api/services/subscriptions/limit-checker'
export { RevenueCatProviderLive } from '@lily/api/services/subscriptions/providers/revenuecat.provider'
export { UsageTrackerLive } from '@lily/api/services/subscriptions/usage-tracker'
export { FileService } from '@lily/shared/services/file/fileservice'
export { GCSService } from '@lily/shared/services/file/gcs'

// ============================================================================
// Composite Layer: AllRepositoriesLive
// All repository implementations — depend on PgDrizzle (from SharedLive)
// and KnowledgeDrizzle for knowledge-specific repos.
// ============================================================================

// Split into two groups to stay under Layer.mergeAll's 20-argument overload limit
const RepositoriesGroup1 = Layer.mergeAll(
  AchievementRepositoryLive,
  BlogPostRepositoryLive,
  CareLogRepositoryLive,
  CareScheduleRepositoryLive,
  ChatRepositoryLive,
  DailyTipRepositoryLive,
  DeadLetterRepositoryLive,
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
  AnalyticsRepositoryLive,
  GiftCodeRepositoryLive,
  ScanRepositoryLive,
  SubscriptionRepositoryLive,
  UserRepositoryLive,
  WeatherRepositoryLive
)

export const AllRepositoriesLive = Layer.mergeAll(
  RepositoriesGroup1,
  RepositoriesGroup2
)

// ============================================================================
// Composite Layer: AllInfrastructureLive
// Auth, Redis, AI, file storage, subscriptions, weather, push notifications.
// Some of these depend on repositories or RedisClient — the dependency
// ordering is handled via Layer.provideMerge in AppLive below.
// ============================================================================

// Self-contained layers (only depend on Config, not on app repos/infra)
// FileService.Default depends on FileSystem from BunContext.layer, so we
// provide BunContext first via Layer.provideMerge to satisfy that dependency.
//
// In development, external services (push notifications, email) are replaced
// with console-logging implementations to avoid hitting real APIs.
const NodeEnvConfig = Config.string('NODE_ENV').pipe(
  Config.withDefault('development')
)

const ExternalServicesLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const nodeEnv = yield* NodeEnvConfig
    if (nodeEnv === 'production') {
      return Layer.mergeAll(ExpoPushServiceLive, ResendEmailServiceLive)
    }
    yield* Effect.log(
      '[DEV] Using console providers for push notifications and email'
    )
    return Layer.mergeAll(ConsolePushServiceLive, ConsoleEmailServiceLive)
  })
)

const SelfContainedInfraLive = Layer.mergeAll(
  AuthenticationLive,
  AdminAuthLive,
  ServiceAuthenticationLive,
  AchievementNotifierLive,
  AiService.Default,
  GCSService.Default,
  FileService.Default,
  RevenueCatProviderLive,
  WeatherProviderLive,
  ExternalServicesLive,
  JWTServiceLive,
  RateLimiterServiceLive,
  MagicLinkConfigLive
).pipe(Layer.provideMerge(BunContext.layer))

// Redis-dependent layers: EventBus, MessageQueue, and WeatherCache all need RedisClient.
// Layer.provideMerge provides RedisClient to the three AND outputs it for downstream use.
const RedisFullLive = Layer.mergeAll(
  RedisEventBusLive,
  RedisMessageQueueLive,
  WeatherCacheLive
).pipe(Layer.provideMerge(RedisClientLive))

// Repo-dependent infra: these need specific repositories to be available.
// LimitCheckerLive needs SubscriptionRepository + AchievementRepository.
// UsageTrackerLive needs SubscriptionRepository.
// RagService.Default needs ProcessedChunkRepository.
const RepoDependentInfraLive = Layer.mergeAll(
  LimitCheckerLive,
  UsageTrackerLive,
  RagService.Default
)

const AllInfrastructureLive = Layer.mergeAll(
  SelfContainedInfraLive,
  RedisFullLive,
  RepoDependentInfraLive
)

// ============================================================================
// AppLive — The single composite layer for the entire application.
//
// Provides ALL repositories + ALL infrastructure. Handlers and schedulers
// declare their dependencies via Effect's R type parameter and get them
// satisfied automatically from AppLive at the root.
//
// Requires: PgDrizzle (from SharedLive = DrizzleLive + PgLive)
// ============================================================================

export const AppLive = AllInfrastructureLive.pipe(
  Layer.provideMerge(AllRepositoriesLive),
  Layer.provideMerge(KnowledgeDrizzleLive)
)
