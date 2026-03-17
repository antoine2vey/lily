import { HttpApiBuilder, HttpApiSwagger, HttpServer } from '@effect/platform'
import { BunHttpServer, BunRuntime } from '@effect/platform-bun'
import { Api } from '@lily/api/api'
import { AppLive } from '@lily/api/layers'
import { LoggerLayer } from '@lily/api/logger'
import { LoggingMiddleware } from '@lily/api/middleware/logging'
import { startAchievementReconciliationScheduler } from '@lily/api/services/achievement-scheduler/scheduler'
import { startAchievementSubscriber } from '@lily/api/services/achievements/checker'
import { AchievementsApiLive } from '@lily/api/services/achievements/handlers'
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
import { InternalApiLive } from '@lily/api/services/internal/handlers'
import { KnowledgeApiLive } from '@lily/api/services/knowledge/handlers'
import { KnowledgeIngestionApiLive } from '@lily/api/services/knowledge-ingestion/handlers'
import { startKnowledgeIngestionWorker } from '@lily/api/services/knowledge-ingestion/worker'
import { startNotificationScheduler } from '@lily/api/services/notification-scheduler/scheduler'
import { startNotificationWorker } from '@lily/api/services/notification-scheduler/worker'
import { NotificationsApiLive } from '@lily/api/services/notifications/handlers'
import { startOverdueScheduler } from '@lily/api/services/overdue-scheduler/scheduler'
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
  Effect.gen(function* () {
    yield* startNotificationScheduler
  })
)

const NotificationWorkerLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    yield* startNotificationWorker
  })
)

const WeatherSchedulerLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    yield* startWeatherScheduler
  })
)

const DelegationSchedulerLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    yield* startDelegationScheduler
  })
)

const AchievementReconciliationSchedulerLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    yield* startAchievementReconciliationScheduler
  })
)

const OverdueSchedulerLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    yield* startOverdueScheduler
  })
)

const EngagementSchedulerLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    yield* startEngagementScheduler
  })
)

const TipsSchedulerLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    yield* startTipsScheduler
  })
)

const BlogGeneratorSchedulerLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    yield* startBlogGeneratorScheduler
  })
)

const HealthSchedulerLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    yield* startHealthScheduler
  })
)

const KnowledgeIngestionWorkerLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    yield* startKnowledgeIngestionWorker
  })
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
  KnowledgeIngestionWorkerLive
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
  InternalApiLive(Api),
  KnowledgeApiLive(Api)
)

// Provide the implementation for all APIs
const ApiLive = HttpApiBuilder.api(Api).pipe(
  Layer.provide(CoreApiHandlers),
  Layer.provide(ExtensionApiHandlers)
)

// Set up the server using BunHttpServer on port 3000
const ServerLive = HttpApiBuilder.serve(LoggingMiddleware).pipe(
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
    Effect.provide(TelemetryLive),
    Effect.provide(LoggerLayer)
  ),
  { disablePrettyLogger: true }
)
