import { BunHttpServer } from '@effect/platform-bun'
import { Api } from '@lily/api/api'
import { AppLive } from '@lily/api/layers'
import { ZoneRulesLive } from '@lily/api/layers/zone-rules'
import { ObservabilityMiddleware } from '@lily/api/middleware/observability'
import { GlobalRouterMiddleware } from '@lily/api/middleware/router'
import { startAccountCleanupScheduler } from '@lily/api/services/account-cleanup/scheduler'
import { startAchievementReconciliationScheduler } from '@lily/api/services/achievement-scheduler/scheduler'
import { startAchievementSubscriber } from '@lily/api/services/achievements/checker'
import { AchievementsApiLive } from '@lily/api/services/achievements/handlers'
import { ActivityPushTokensApiLive } from '@lily/api/services/activity-push-tokens/handlers'
import { startActivityScheduler } from '@lily/api/services/activity-scheduler/scheduler'
import { AdminApiLive } from '@lily/api/services/admin/handlers'
import { AdminAnalyticsApiLive } from '@lily/api/services/admin-analytics/handlers'
import { startChatFollowUpWorker } from '@lily/api/services/ai-chat/follow-up-worker'
import { AIChatApiLive } from '@lily/api/services/ai-chat/handlers'
import { startAnalyticsScheduler } from '@lily/api/services/analytics-scheduler/scheduler'
import { startAuthCleanupScheduler } from '@lily/api/services/auth/cleanup-scheduler'
import { AuthApiLive } from '@lily/api/services/auth/handlers'
import { startBlogGeneratorScheduler } from '@lily/api/services/blog-generator/scheduler'
import {
  CanopyApiLive,
  CanopyInvitesApiLive,
} from '@lily/api/services/canopy/handlers'
import { CareLogsApiLive } from '@lily/api/services/care-logs/handlers'
import { CarePlansApiLive } from '@lily/api/services/care-plans/handlers'
import { CareTasksApiLive } from '@lily/api/services/care-tasks/handlers'
import { DelegationApiLive } from '@lily/api/services/delegation/handlers'
import { startDelegationScheduler } from '@lily/api/services/delegation-scheduler/scheduler'
import { DeviceTokensApiLive } from '@lily/api/services/device-tokens/handlers'
import { DiagnosisApiLive } from '@lily/api/services/diagnosis/handlers'
import { startEngagementScheduler } from '@lily/api/services/engagement-scheduler/scheduler'
import { HealthApiLive } from '@lily/api/services/health/handlers'
import { SHUTDOWN_DRAIN_DEADLINE } from '@lily/api/services/helpers/create-scheduler'
import { InternalApiLive } from '@lily/api/services/internal/handlers'
import { KnowledgeApiLive } from '@lily/api/services/knowledge/handlers'
import { startEmbeddingBackfillScheduler } from '@lily/api/services/knowledge-ingestion/embedding-backfill'
import { KnowledgeIngestionApiLive } from '@lily/api/services/knowledge-ingestion/handlers'
import { startKnowledgeIngestionWorker } from '@lily/api/services/knowledge-ingestion/worker'
import { startLiveActivitySubscriber } from '@lily/api/services/live-activity/subscriber'
import { startNotificationScheduler } from '@lily/api/services/notification-scheduler/scheduler'
import { startNotificationWorker } from '@lily/api/services/notification-scheduler/worker'
import { NotificationsApiLive } from '@lily/api/services/notifications/handlers'
import { startOverdueScheduler } from '@lily/api/services/overdue-scheduler/scheduler'
import { PlantCatalogApiLive } from '@lily/api/services/plant-catalog/handlers'
import { PlantsApiLive } from '@lily/api/services/plants/handlers'
import { startPushReceiptScheduler } from '@lily/api/services/push-receipt-scheduler/scheduler'
import { startRemindersAuditScheduler } from '@lily/api/services/reminders-audit/scheduler'
import { RoomsApiLive } from '@lily/api/services/rooms/handlers'
import { SocialApiLive } from '@lily/api/services/social/handlers'
import {
  SubscriptionsApiLive,
  SubscriptionWebhooksApiLive,
} from '@lily/api/services/subscriptions/handlers'
import { startSubscriptionReconciliationScheduler } from '@lily/api/services/subscriptions/reconciliation-scheduler'
import { startTipsScheduler } from '@lily/api/services/tips-scheduler/scheduler'
import { UsersApiLive } from '@lily/api/services/user/handlers'
import { UsernameApiLive } from '@lily/api/services/username/handlers'
import { VacationApiLive } from '@lily/api/services/vacation/handlers'
import { startVacationScheduler } from '@lily/api/services/vacation-scheduler/scheduler'
import { WeatherApiLive } from '@lily/api/services/weather/handlers'
import { startWeatherScheduler } from '@lily/api/services/weather-scheduler/scheduler'
import { startWeeklyRecapScheduler } from '@lily/api/services/weekly-recap-scheduler/scheduler'
import { DrizzleLive, PgLive } from '@lily/db'
import { Effect, Layer } from 'effect'
import { HttpRouter } from 'effect/http'
import { HttpApiBuilder, HttpApiSwagger } from 'effect/http-api'

const SharedLive = Layer.mergeAll(DrizzleLive, PgLive)

const AchievementSubscriberLive = Layer.effectDiscard(
  Effect.gen(function* () {
    yield* startAchievementSubscriber
    yield* Effect.log('Achievement subscriber started')
  })
)

const NotificationSchedulerLive = Layer.effectDiscard(
  startNotificationScheduler
)

const NotificationWorkerLive = Layer.effectDiscard(startNotificationWorker)

const WeatherSchedulerLive = Layer.effectDiscard(startWeatherScheduler)

const DelegationSchedulerLive = Layer.effectDiscard(startDelegationScheduler)

const AchievementReconciliationSchedulerLive = Layer.effectDiscard(
  startAchievementReconciliationScheduler
)

const OverdueSchedulerLive = Layer.effectDiscard(startOverdueScheduler)

const RemindersAuditSchedulerLive = Layer.effectDiscard(
  startRemindersAuditScheduler
)

const EngagementSchedulerLive = Layer.effectDiscard(startEngagementScheduler)

const TipsSchedulerLive = Layer.effectDiscard(startTipsScheduler)

const WeeklyRecapSchedulerLive = Layer.effectDiscard(startWeeklyRecapScheduler)

const BlogGeneratorSchedulerLive = Layer.effectDiscard(
  startBlogGeneratorScheduler
)

const AccountCleanupSchedulerLive = Layer.effectDiscard(
  startAccountCleanupScheduler
)

const AuthCleanupSchedulerLive = Layer.effectDiscard(startAuthCleanupScheduler)

const AnalyticsSchedulerLive = Layer.effectDiscard(startAnalyticsScheduler)

const ActivitySchedulerLive = Layer.effectDiscard(startActivityScheduler)

const VacationSchedulerLive = Layer.effectDiscard(startVacationScheduler)

const SubscriptionReconciliationSchedulerLive = Layer.effectDiscard(
  startSubscriptionReconciliationScheduler
)

const LiveActivitySubscriberLive = Layer.effectDiscard(
  Effect.gen(function* () {
    yield* startLiveActivitySubscriber
    yield* Effect.log('Live activity subscriber started')
  })
)

const KnowledgeIngestionWorkerLive = Layer.effectDiscard(
  startKnowledgeIngestionWorker
)

const EmbeddingBackfillSchedulerLive = Layer.effectDiscard(
  startEmbeddingBackfillScheduler
)

const ChatFollowUpWorkerLive = Layer.effectDiscard(startChatFollowUpWorker)

const AllSchedulersLive = Layer.mergeAll(
  AchievementReconciliationSchedulerLive,
  AchievementSubscriberLive,
  DelegationSchedulerLive,
  OverdueSchedulerLive,
  RemindersAuditSchedulerLive,
  WeatherSchedulerLive,
  NotificationSchedulerLive,
  NotificationWorkerLive,
  EngagementSchedulerLive,
  TipsSchedulerLive,
  BlogGeneratorSchedulerLive,
  KnowledgeIngestionWorkerLive,
  EmbeddingBackfillSchedulerLive,
  ChatFollowUpWorkerLive,
  AccountCleanupSchedulerLive,
  AuthCleanupSchedulerLive,
  WeeklyRecapSchedulerLive,
  AnalyticsSchedulerLive,
  ActivitySchedulerLive,
  LiveActivitySubscriberLive,
  VacationSchedulerLive,
  SubscriptionReconciliationSchedulerLive,
  Layer.effectDiscard(startPushReceiptScheduler)
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
  CanopyApiLive(Api),
  CanopyInvitesApiLive(Api),
  CarePlansApiLive(Api),
  AdminAnalyticsApiLive(Api),
  InternalApiLive(Api),
  KnowledgeApiLive(Api),
  VacationApiLive(Api)
)

const ApiRoutes = HttpApiBuilder.layer(Api, {
  openapiPath: '/openapi.json',
}).pipe(Layer.provide(CoreApiHandlers), Layer.provide(ExtensionApiHandlers))

const AllRoutes = Layer.mergeAll(
  ApiRoutes,
  HttpApiSwagger.layer(Api),
  GlobalRouterMiddleware
)

// ObservabilityMiddleware already logs every request, so the router's
// built-in request logger is disabled to avoid a duplicate line.
// Merged rather than provided, so on SIGTERM the HTTP server and the
// schedulers drain in parallel, both before AppLive's connections close.
export const ServerLive = Layer.mergeAll(
  HttpRouter.serve(AllRoutes, {
    middleware: ObservabilityMiddleware,
    disableLogger: true,
  }),
  AllSchedulersLive
).pipe(
  Layer.provide(AppLive),
  Layer.provide(SharedLive),
  Layer.provide(
    BunHttpServer.layer({
      port: 3000,
      hostname: '0.0.0.0',
      idleTimeout: 120,
      gracefulShutdownTimeout: SHUTDOWN_DRAIN_DEADLINE,
    })
  ),
  Layer.provide(ZoneRulesLive)
)
