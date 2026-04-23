import { HttpApiBuilder, HttpApiSwagger, HttpServer } from '@effect/platform'
import { BunHttpServer, BunRuntime } from '@effect/platform-bun'
import { Api } from '@lily/api/api'
import { AppLive } from '@lily/api/layers'
import { LoggerLayer } from '@lily/api/logger'
import { ObservabilityMiddleware } from '@lily/api/middleware/observability'
import { startAccountCleanupScheduler } from '@lily/api/services/account-cleanup/scheduler'
import { startAchievementReconciliationScheduler } from '@lily/api/services/achievement-scheduler/scheduler'
import { startAchievementSubscriber } from '@lily/api/services/achievements/checker'
import { AchievementsApiLive } from '@lily/api/services/achievements/handlers'
import { ActivityPushTokensApiLive } from '@lily/api/services/activity-push-tokens/handlers'
import { startActivityScheduler } from '@lily/api/services/activity-scheduler/scheduler'
import { AdminApiLive } from '@lily/api/services/admin/handlers'
import { AdminAnalyticsApiLive } from '@lily/api/services/admin-analytics/handlers'
import { AIChatApiLive } from '@lily/api/services/ai-chat/handlers'
import { startAnalyticsScheduler } from '@lily/api/services/analytics-scheduler/scheduler'
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
import { InternalApiLive } from '@lily/api/services/internal/handlers'
import { KnowledgeApiLive } from '@lily/api/services/knowledge/handlers'
import { KnowledgeIngestionApiLive } from '@lily/api/services/knowledge-ingestion/handlers'
import { startKnowledgeIngestionWorker } from '@lily/api/services/knowledge-ingestion/worker'
import { startLiveActivitySubscriber } from '@lily/api/services/live-activity/subscriber'
import { startNotificationScheduler } from '@lily/api/services/notification-scheduler/scheduler'
import { startNotificationWorker } from '@lily/api/services/notification-scheduler/worker'
import { NotificationsApiLive } from '@lily/api/services/notifications/handlers'
import { startOverdueScheduler } from '@lily/api/services/overdue-scheduler/scheduler'
import { PlantCatalogApiLive } from '@lily/api/services/plant-catalog/handlers'
import { PlantsApiLive } from '@lily/api/services/plants/handlers'
import { RoomsApiLive } from '@lily/api/services/rooms/handlers'
import { SocialApiLive } from '@lily/api/services/social/handlers'
import {
  SubscriptionsApiLive,
  SubscriptionWebhooksApiLive,
} from '@lily/api/services/subscriptions/handlers'
import { startTipsScheduler } from '@lily/api/services/tips-scheduler/scheduler'
import { UsersApiLive } from '@lily/api/services/user/handlers'
import { UsernameApiLive } from '@lily/api/services/username/handlers'
import { WeatherApiLive } from '@lily/api/services/weather/handlers'
import { startWeatherScheduler } from '@lily/api/services/weather-scheduler/scheduler'
import { startWeeklyRecapScheduler } from '@lily/api/services/weekly-recap-scheduler/scheduler'
import { TelemetryLive } from '@lily/api/telemetry/otel'
import { DrizzleLive, PgLive } from '@lily/db'
import { Effect, Layer } from 'effect'

// Shared database layers
const SharedLive = Layer.mergeAll(DrizzleLive, PgLive)

// Background schedulers and workers — deps come from AppLive at root
const AchievementSubscriberLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    yield* startAchievementSubscriber
    yield* Effect.log('Achievement subscriber started')
  })
)

const NotificationSchedulerLive = Layer.scopedDiscard(
  startNotificationScheduler
)

const NotificationWorkerLive = Layer.scopedDiscard(startNotificationWorker)

const WeatherSchedulerLive = Layer.scopedDiscard(startWeatherScheduler)

const DelegationSchedulerLive = Layer.scopedDiscard(startDelegationScheduler)

const AchievementReconciliationSchedulerLive = Layer.scopedDiscard(
  startAchievementReconciliationScheduler
)

const OverdueSchedulerLive = Layer.scopedDiscard(startOverdueScheduler)

const EngagementSchedulerLive = Layer.scopedDiscard(startEngagementScheduler)

const TipsSchedulerLive = Layer.scopedDiscard(startTipsScheduler)

const WeeklyRecapSchedulerLive = Layer.scopedDiscard(startWeeklyRecapScheduler)

const BlogGeneratorSchedulerLive = Layer.scopedDiscard(
  startBlogGeneratorScheduler
)

const HealthSchedulerLive = Layer.scopedDiscard(startHealthScheduler)

const AccountCleanupSchedulerLive = Layer.scopedDiscard(
  startAccountCleanupScheduler
)

const AnalyticsSchedulerLive = Layer.scopedDiscard(startAnalyticsScheduler)

const ActivitySchedulerLive = Layer.scopedDiscard(startActivityScheduler)

const LiveActivitySubscriberLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    yield* startLiveActivitySubscriber
    yield* Effect.log('Live activity subscriber started')
  })
)

const KnowledgeIngestionWorkerLive = Layer.scopedDiscard(
  startKnowledgeIngestionWorker
)

// Group all background schedulers into one layer
const AllSchedulersLive = Layer.mergeAll(
  AchievementReconciliationSchedulerLive,
  AchievementSubscriberLive,
  DelegationSchedulerLive,
  HealthSchedulerLive,
  OverdueSchedulerLive,
  WeatherSchedulerLive,
  NotificationSchedulerLive,
  NotificationWorkerLive,
  EngagementSchedulerLive,
  TipsSchedulerLive,
  BlogGeneratorSchedulerLive,
  KnowledgeIngestionWorkerLive,
  AccountCleanupSchedulerLive,
  WeeklyRecapSchedulerLive,
  AnalyticsSchedulerLive,
  ActivitySchedulerLive,
  LiveActivitySubscriberLive
)

// Group API handler layers to stay under pipe's 20-argument overload limit
const CoreApiHandlers = Layer.mergeAll(
  AchievementsApiLive(Api),
  AdminApiLive(Api),
  AIChatApiLive(Api),
  AuthApiLive(Api),
  CareLogsApiLive(Api),
  CareTasksApiLive(Api),
  DiagnosisApiLive(Api),
  DeviceTokensApiLive(Api),
  HealthApiLive(Api),
  NotificationsApiLive(Api),
  PlantsApiLive(Api),
  PlantCatalogApiLive(Api),
  RoomsApiLive(Api),
  DelegationApiLive(Api),
  SocialApiLive(Api),
  SubscriptionsApiLive(Api),
  SubscriptionWebhooksApiLive(Api),
  UsernameApiLive(Api),
  UsersApiLive(Api),
  WeatherApiLive(Api),
  KnowledgeIngestionApiLive(Api)
)

const ExtensionApiHandlers = Layer.mergeAll(
  ActivityPushTokensApiLive(Api),
  AdminAnalyticsApiLive(Api),
  InternalApiLive(Api),
  KnowledgeApiLive(Api)
)

// Provide the implementation for all APIs
const ApiLive = HttpApiBuilder.api(Api).pipe(
  Layer.provide(CoreApiHandlers),
  Layer.provide(ExtensionApiHandlers)
)

// Set up the server using BunHttpServer on port 3000
const ServerLive = HttpApiBuilder.serve(ObservabilityMiddleware).pipe(
  Layer.provide(HttpApiBuilder.middlewareCors({ maxAge: 86400 })),
  Layer.provide(HttpApiSwagger.layer()),
  Layer.provide(HttpApiBuilder.middlewareOpenApi()),
  Layer.provide(ApiLive),
  Layer.provide(AllSchedulersLive),
  Layer.provide(AppLive),
  Layer.provide(SharedLive),
  HttpServer.withLogAddress,
  Layer.provide(
    BunHttpServer.layer({ port: 3000, hostname: '0.0.0.0', idleTimeout: 120 })
  )
)

// Launch the server with optional telemetry
BunRuntime.runMain(
  Layer.launch(ServerLive).pipe(
    Effect.provide(Layer.merge(TelemetryLive, LoggerLayer))
  ),
  { disablePrettyLogger: true }
)
