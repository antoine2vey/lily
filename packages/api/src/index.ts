import { HttpApiBuilder, HttpApiSwagger, HttpServer } from '@effect/platform'
import { BunHttpServer, BunRuntime } from '@effect/platform-bun'
import { Api } from '@lily/api/api'
import { RedisEventBusLive } from '@lily/api/events'
import { LoggingMiddleware } from '@lily/api/middleware/logging'
import { AchievementRepositoryLive } from '@lily/api/repositories/achievement.repository'
import { DeadLetterRepositoryLive } from '@lily/api/repositories/dead-letter.repository'
import { DeviceTokenRepositoryLive } from '@lily/api/repositories/device-token.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { WeatherRepositoryLive } from '@lily/api/repositories/weather.repository'
import { startAchievementSubscriber } from '@lily/api/services/achievements/checker'
import { AchievementsApiLive } from '@lily/api/services/achievements/handlers'
import { AdminApiLive } from '@lily/api/services/admin/handlers'
import { AIChatApiLive } from '@lily/api/services/ai-chat/handlers'
import { AuthApiLive } from '@lily/api/services/auth/handlers'
import { CareLogsApiLive } from '@lily/api/services/care-logs/handlers'
import { CareTasksApiLive } from '@lily/api/services/care-tasks/handlers'
import { DeviceTokensApiLive } from '@lily/api/services/device-tokens/handlers'
import { HealthApiLive } from '@lily/api/services/health/handlers'
import { startHealthScheduler } from '@lily/api/services/health-scheduler/scheduler'
import {
  RedisClientLive,
  RedisMessageQueueLive,
} from '@lily/api/services/message-queue/redis.provider'
import { startNotificationScheduler } from '@lily/api/services/notification-scheduler/scheduler'
import { startNotificationWorker } from '@lily/api/services/notification-scheduler/worker'
import { NotificationsApiLive } from '@lily/api/services/notifications/handlers'
import { PlantsApiLive } from '@lily/api/services/plants/handlers'
import { ExpoPushServiceLive } from '@lily/api/services/push/expo.provider'
import { RoomsApiLive } from '@lily/api/services/rooms/handlers'
import {
  SubscriptionsApiLive,
  SubscriptionWebhooksApiLive,
} from '@lily/api/services/subscriptions/handlers'
import { UsersApiLive } from '@lily/api/services/user/handlers'
import { UsernameApiLive } from '@lily/api/services/username/handlers'
import { WeatherCacheLive } from '@lily/api/services/weather/cache.live'
import { WeatherApiLive } from '@lily/api/services/weather/handlers'
import { WeatherProviderLive } from '@lily/api/services/weather/provider.live'
import { startWeatherScheduler } from '@lily/api/services/weather-scheduler/scheduler'
import { TelemetryLive } from '@lily/api/telemetry/otel'
import { DrizzleLive, PgLive } from '@lily/db'
import { Effect, Layer } from 'effect'

// Shared infrastructure layers
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
  Layer.provide(NotificationRepositoryLive),
  Layer.provide(RedisClientLive)
)

// Health scheduler layer - marks overdue plants as NEEDS_ATTENTION
const HealthSchedulerLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    yield* startHealthScheduler
  })
).pipe(Layer.provide(PlantRepositoryLive))

// Provide the implementation for all APIs
const ApiLive = HttpApiBuilder.api(Api).pipe(
  Layer.provide(AchievementsApiLive(Api)),
  Layer.provide(AdminApiLive(Api)),
  Layer.provide(AIChatApiLive(Api)),
  Layer.provide(AuthApiLive(Api)),
  Layer.provide(CareLogsApiLive(Api)),
  Layer.provide(CareTasksApiLive(Api)),
  Layer.provide(DeviceTokensApiLive(Api)),
  Layer.provide(HealthApiLive(Api)),
  Layer.provide(NotificationsApiLive(Api)),
  Layer.provide(PlantsApiLive(Api)),
  Layer.provide(RoomsApiLive(Api)),
  Layer.provide(SubscriptionsApiLive(Api)),
  Layer.provide(SubscriptionWebhooksApiLive(Api)),
  Layer.provide(UsernameApiLive(Api)),
  Layer.provide(UsersApiLive(Api)),
  Layer.provide(WeatherApiLive(Api))
)

// Set up the server using BunHttpServer on port 3000
const ServerLive = HttpApiBuilder.serve(LoggingMiddleware).pipe(
  Layer.provide(HttpApiBuilder.middlewareCors()),
  Layer.provide(HttpApiSwagger.layer()),
  Layer.provide(HttpApiBuilder.middlewareOpenApi()),
  Layer.provide(ApiLive),
  Layer.provide(AchievementSubscriberLive),
  Layer.provide(HealthSchedulerLive),
  Layer.provide(WeatherSchedulerLive),
  Layer.provide(NotificationSchedulerLive),
  Layer.provide(NotificationWorkerLive),
  Layer.provide(SharedLive),
  HttpServer.withLogAddress,
  Layer.provide(BunHttpServer.layer({ port: 3000, hostname: '0.0.0.0' }))
)

// Launch the server with optional telemetry
BunRuntime.runMain(Layer.launch(ServerLive).pipe(Effect.provide(TelemetryLive)))
