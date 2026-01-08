import { HttpApiBuilder, HttpApiSwagger, HttpServer } from '@effect/platform'
import { BunHttpServer, BunRuntime } from '@effect/platform-bun'
import { Api } from '@lily/api/api'
import { EventBusLive } from '@lily/api/events'
import { AchievementRepositoryLive } from '@lily/api/repositories/achievement.repository'
import { startAchievementSubscriber } from '@lily/api/services/achievements/checker'
import { AchievementsApiLive } from '@lily/api/services/achievements/handlers'
import { AIChatApiLive } from '@lily/api/services/ai-chat/handlers'
import { AuthApiLive } from '@lily/api/services/auth/handlers'
import { CareLogsApiLive } from '@lily/api/services/care-logs/handlers'
import { DeviceTokensApiLive } from '@lily/api/services/device-tokens/handlers'
import { NotificationsApiLive } from '@lily/api/services/notifications/handlers'
import { PlantsApiLive } from '@lily/api/services/plants/handlers'
import { UsersApiLive } from '@lily/api/services/user/handlers'
import { UsernameApiLive } from '@lily/api/services/username/handlers'
import { DrizzleLive } from '@lily/db'
import { Effect, Layer } from 'effect'

// Shared infrastructure layers
const SharedLive = Layer.mergeAll(EventBusLive, DrizzleLive)

// Achievement subscriber layer - starts the background event processor
const AchievementSubscriberLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    yield* startAchievementSubscriber
    yield* Effect.log('Achievement subscriber started')
  })
).pipe(Layer.provide(AchievementRepositoryLive))

// Provide the implementation for all APIs
const ApiLive = HttpApiBuilder.api(Api).pipe(
  Layer.provide(AchievementsApiLive(Api)),
  Layer.provide(AIChatApiLive(Api)),
  Layer.provide(AuthApiLive(Api)),
  Layer.provide(CareLogsApiLive(Api)),
  Layer.provide(DeviceTokensApiLive(Api)),
  Layer.provide(NotificationsApiLive(Api)),
  Layer.provide(PlantsApiLive(Api)),
  Layer.provide(UsernameApiLive(Api)),
  Layer.provide(UsersApiLive(Api))
)

// Set up the server using BunHttpServer on port 3000
const ServerLive = HttpApiBuilder.serve().pipe(
  Layer.provide(HttpApiBuilder.middlewareCors()),
  Layer.provide(HttpApiSwagger.layer()),
  Layer.provide(ApiLive),
  Layer.provide(AchievementSubscriberLive),
  Layer.provide(SharedLive),
  HttpServer.withLogAddress,
  Layer.provide(BunHttpServer.layer({ port: 3000 }))
)

// Launch the server
BunRuntime.runMain(Layer.launch(ServerLive))
