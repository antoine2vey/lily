import { HttpApiBuilder, HttpApiSwagger, HttpServer } from '@effect/platform'
import { BunHttpServer, BunRuntime } from '@effect/platform-bun'
import { Api } from '@lily/api/api'
import { RedisEventBusLive } from '@lily/api/events'
import { LoggerLayer } from '@lily/api/logger'
import { LoggingMiddleware } from '@lily/api/middleware/logging'
import { AchievementRepositoryLive } from '@lily/api/repositories/achievement.repository'
import { BlogPostRepositoryLive } from '@lily/api/repositories/blog-post.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DailyTipRepositoryLive } from '@lily/api/repositories/daily-tip.repository'
import { DeadLetterRepositoryLive } from '@lily/api/repositories/dead-letter.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { DeviceTokenRepositoryLive } from '@lily/api/repositories/device-token.repository'
import { EngagementRepositoryLive } from '@lily/api/repositories/engagement.repository'
import { IngestJobRepositoryLive } from '@lily/api/repositories/ingest-job.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { ProcessedChunkRepositoryLive } from '@lily/api/repositories/processed-chunk.repository'
import { RawDocumentRepositoryLive } from '@lily/api/repositories/raw-document.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { WeatherRepositoryLive } from '@lily/api/repositories/weather.repository'
import { startAchievementReconciliationScheduler } from '@lily/api/services/achievement-scheduler/scheduler'
import { startAchievementSubscriber } from '@lily/api/services/achievements/checker'
import { AchievementsApiLive } from '@lily/api/services/achievements/handlers'
import { AchievementNotifierLive } from '@lily/api/services/achievements/notifier'
import { AdminApiLive } from '@lily/api/services/admin/handlers'
import { AIChatApiLive } from '@lily/api/services/ai-chat/handlers'
import { AuthApiLive } from '@lily/api/services/auth/handlers'
import { startBlogGeneratorScheduler } from '@lily/api/services/blog-generator/scheduler'
import { CareLogsApiLive } from '@lily/api/services/care-logs/handlers'
import { CareTasksApiLive } from '@lily/api/services/care-tasks/handlers'
import { DelegationApiLive } from '@lily/api/services/delegation/handlers'
import { startDelegationScheduler } from '@lily/api/services/delegation-scheduler/scheduler'
import { DeviceTokensApiLive } from '@lily/api/services/device-tokens/handlers'
import { DiagnosisApiLive } from '@lily/api/services/diagnosis/handlers'
import { startEngagementScheduler } from '@lily/api/services/engagement-scheduler/scheduler'
import { HealthApiLive } from '@lily/api/services/health/handlers'
import { startHealthScheduler } from '@lily/api/services/health-scheduler/scheduler'
import { KnowledgeIngestionApiLive } from '@lily/api/services/knowledge-ingestion/handlers'
import { startKnowledgeIngestionWorker } from '@lily/api/services/knowledge-ingestion/worker'
import {
  RedisClientLive,
  RedisMessageQueueLive,
} from '@lily/api/services/message-queue/redis.provider'
import { startNotificationScheduler } from '@lily/api/services/notification-scheduler/scheduler'
import { startNotificationWorker } from '@lily/api/services/notification-scheduler/worker'
import { NotificationsApiLive } from '@lily/api/services/notifications/handlers'
import { startOverdueScheduler } from '@lily/api/services/overdue-scheduler/scheduler'
import { PlantsApiLive } from '@lily/api/services/plants/handlers'
import { ExpoPushServiceLive } from '@lily/api/services/push/expo.provider'
import { RagService } from '@lily/api/services/rag/service'
import { RoomsApiLive } from '@lily/api/services/rooms/handlers'
import { SocialApiLive } from '@lily/api/services/social/handlers'
import {
  SubscriptionsApiLive,
  SubscriptionWebhooksApiLive,
} from '@lily/api/services/subscriptions/handlers'
import { startTipsScheduler } from '@lily/api/services/tips-scheduler/scheduler'
import { UsersApiLive } from '@lily/api/services/user/handlers'
import { UsernameApiLive } from '@lily/api/services/username/handlers'
import { WeatherCacheLive } from '@lily/api/services/weather/cache.live'
import { WeatherApiLive } from '@lily/api/services/weather/handlers'
import { WeatherProviderLive } from '@lily/api/services/weather/provider.live'
import { startWeatherScheduler } from '@lily/api/services/weather-scheduler/scheduler'
import { TelemetryLive } from '@lily/api/telemetry/otel'
import { DrizzleLive, PgLive } from '@lily/db'
import { KnowledgeDrizzleLive } from '@lily/knowledge-db'
import { Effect, Layer } from 'effect'

// Shared infrastructure layers.
const SharedLive = Layer.mergeAll(DrizzleLive, PgLive)

// Redis event bus layer with its dependency
const RedisEventBusFullLive = RedisEventBusLive.pipe(
  Layer.provide(RedisClientLive)
)

// Achievement subscriber layer - starts the background event processor
const AchievementSubscriberLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    yield* startAchievementSubscriber
    yield* Effect.log('Achievement subscriber started')
  })
).pipe(
  Layer.provide(AchievementRepositoryLive),
  Layer.provide(RedisEventBusFullLive)
)

// Notification scheduler layer - polls DB and enqueues to Redis
const NotificationSchedulerLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    yield* startNotificationScheduler
  })
).pipe(
  Layer.provide(NotificationRepositoryLive),
  Layer.provide(PlantRepositoryLive),
  Layer.provide(UserRepositoryLive),
  Layer.provide(RedisMessageQueueLive),
  Layer.provide(RedisClientLive)
)

// Notification worker layer - consumes from Redis and sends via Expo Push
const NotificationWorkerLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    yield* startNotificationWorker
  })
).pipe(
  Layer.provide(NotificationRepositoryLive),
  Layer.provide(DeviceTokenRepositoryLive),
  Layer.provide(DeadLetterRepositoryLive),
  Layer.provide(RedisMessageQueueLive),
  Layer.provide(RedisClientLive),
  Layer.provide(ExpoPushServiceLive)
)

// Weather scheduler layer - fetches weather data for users with weather enabled
// Also readjusts plant care schedules based on latest weather
const WeatherSchedulerLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    yield* startWeatherScheduler
  })
).pipe(
  Layer.provide(WeatherCacheLive),
  Layer.provide(WeatherProviderLive),
  Layer.provide(WeatherRepositoryLive),
  Layer.provide(UserRepositoryLive),
  Layer.provide(PlantRepositoryLive),
  Layer.provide(CareScheduleRepositoryLive),
  Layer.provide(NotificationRepositoryLive),
  Layer.provide(DelegationRepositoryLive),
  Layer.provide(RedisClientLive)
)

// Delegation scheduler layer - auto-transitions accepted→active and active→completed
const DelegationSchedulerLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    yield* startDelegationScheduler
  })
).pipe(
  Layer.provide(DelegationRepositoryLive),
  Layer.provide(NotificationRepositoryLive),
  Layer.provide(UserRepositoryLive),
  Layer.provide(RedisMessageQueueLive),
  Layer.provide(RedisClientLive)
)

// Achievement reconciliation scheduler - catches up missed threshold-based unlocks
const AchievementReconciliationSchedulerLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    yield* startAchievementReconciliationScheduler
  })
).pipe(Layer.provide(AchievementRepositoryLive))

// Overdue reminder scheduler layer - sends daily overdue watering reminders
const OverdueSchedulerLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    yield* startOverdueScheduler
  })
).pipe(
  Layer.provide(CareScheduleRepositoryLive),
  Layer.provide(PlantRepositoryLive),
  Layer.provide(NotificationRepositoryLive),
  Layer.provide(UserRepositoryLive),
  Layer.provide(DelegationRepositoryLive)
)

// Engagement scheduler layer - inactivity nudges, photo reminders, milestones
const EngagementSchedulerLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    yield* startEngagementScheduler
  })
).pipe(
  Layer.provide(EngagementRepositoryLive),
  Layer.provide(NotificationRepositoryLive),
  Layer.provide(UserRepositoryLive)
)

// Tips scheduler layer - sends plant care tips during quiet periods
const TipsSchedulerLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    yield* startTipsScheduler
  })
).pipe(
  Layer.provide(EngagementRepositoryLive),
  Layer.provide(NotificationRepositoryLive),
  Layer.provide(UserRepositoryLive)
)

// Health scheduler layer - marks overdue plants as NEEDS_ATTENTION
const HealthSchedulerLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    yield* startHealthScheduler
  })
).pipe(Layer.provide(PlantRepositoryLive))

// Blog generator scheduler layer - generates SEO blog posts
const BlogGeneratorSchedulerLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    yield* startBlogGeneratorScheduler
  })
).pipe(Layer.provide(BlogPostRepositoryLive))

// Tips scheduler layer - generates daily plant care tips
const TipsSchedulerLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    yield* startTipsScheduler
  })
).pipe(
  Layer.provide(DailyTipRepositoryLive),
  Layer.provide(NotificationRepositoryLive),
  Layer.provide(UserRepositoryLive),
  Layer.provide(RagService.Default),
  Layer.provide(ProcessedChunkRepositoryLive),
  Layer.provide(KnowledgeDrizzleLive)
)

// Knowledge ingestion worker layer - polls for pending ingest jobs
const KnowledgeIngestionWorkerLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    yield* startKnowledgeIngestionWorker
  })
).pipe(
  Layer.provide(IngestJobRepositoryLive),
  Layer.provide(RawDocumentRepositoryLive),
  Layer.provide(ProcessedChunkRepositoryLive),
  Layer.provide(DeadLetterRepositoryLive),
  Layer.provide(KnowledgeDrizzleLive)
)

// Provide the implementation for all APIs
const ApiLive = HttpApiBuilder.api(Api).pipe(
  Layer.provide(AchievementsApiLive(Api)),
  Layer.provide(AdminApiLive(Api)),
  Layer.provide(AIChatApiLive(Api)),
  Layer.provide(AuthApiLive(Api)),
  Layer.provide(CareLogsApiLive(Api)),
  Layer.provide(CareTasksApiLive(Api)),
  Layer.provide(DiagnosisApiLive(Api)),
  Layer.provide(DeviceTokensApiLive(Api)),
  Layer.provide(HealthApiLive(Api)),
  Layer.provide(NotificationsApiLive(Api)),
  Layer.provide(PlantsApiLive(Api)),
  Layer.provide(RoomsApiLive(Api)),
  Layer.provide(DelegationApiLive(Api)),
  Layer.provide(SocialApiLive(Api)),
  Layer.provide(SubscriptionsApiLive(Api)),
  Layer.provide(SubscriptionWebhooksApiLive(Api)),
  Layer.provide(UsernameApiLive(Api)),
  Layer.provide(UsersApiLive(Api)),
  Layer.provide(WeatherApiLive(Api)),
  Layer.provide(KnowledgeIngestionApiLive(Api))
)

// Set up the server using BunHttpServer on port 3000
const ServerLive = HttpApiBuilder.serve(LoggingMiddleware).pipe(
  Layer.provide(HttpApiBuilder.middlewareCors({ maxAge: 86400 })),
  Layer.provide(HttpApiSwagger.layer()),
  Layer.provide(HttpApiBuilder.middlewareOpenApi()),
  Layer.provide(ApiLive),
  Layer.provide(AchievementReconciliationSchedulerLive),
  Layer.provide(AchievementSubscriberLive),
  Layer.provide(AchievementNotifierLive),
  Layer.provide(DelegationSchedulerLive),
  Layer.provide(HealthSchedulerLive),
  Layer.provide(OverdueSchedulerLive),
  Layer.provide(WeatherSchedulerLive),
  Layer.provide(NotificationSchedulerLive),
  Layer.provide(NotificationWorkerLive),
  Layer.provide(EngagementSchedulerLive),
  Layer.provide(TipsSchedulerLive),
  Layer.provide(KnowledgeIngestionWorkerLive),
  Layer.provide(BlogGeneratorSchedulerLive),
  Layer.provide(TipsSchedulerLive),
  Layer.provide(SharedLive),
  HttpServer.withLogAddress,
  Layer.provide(
    BunHttpServer.layer({ port: 3000, hostname: '0.0.0.0', idleTimeout: 120 })
  )
)

// Launch the server with optional telemetry
BunRuntime.runMain(
  Layer.launch(ServerLive).pipe(
    Effect.provide(TelemetryLive),
    Effect.provide(LoggerLayer)
  ),
  { disablePrettyLogger: true }
)
