import { HttpApiBuilder, HttpApiSwagger, HttpServer } from '@effect/platform'
import { BunHttpServer, BunRuntime } from '@effect/platform-bun'
import { Api } from '@lily/api/api'
import { PlantsApiLive } from '@lily/api/services/plants/handlers'
import { UsersApiLive } from '@lily/api/services/user/handlers'
import { Layer } from 'effect'

// Provide the implementation for both APIs
const ApiLive = HttpApiBuilder.api(Api).pipe(
  Layer.provide(PlantsApiLive(Api)),
  Layer.provide(UsersApiLive(Api))
)

// Set up the server using BunHttpServer on port 3000
const ServerLive = HttpApiBuilder.serve().pipe(
  Layer.provide(HttpApiBuilder.middlewareCors()),
  Layer.provide(HttpApiSwagger.layer()),
  Layer.provide(ApiLive),
  HttpServer.withLogAddress,
  Layer.provide(BunHttpServer.layer({ port: 3000 }))
)

// Launch the server
Layer.launch(ServerLive).pipe(BunRuntime.runMain)
