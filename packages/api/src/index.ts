import { BunRuntime } from '@effect/platform-bun'
import { LoggerLayer } from '@lily/api/logger'
import { ServerLive } from '@lily/api/server'
import { TelemetryLive } from '@lily/api/telemetry/otel'
import { Effect, Layer } from 'effect'

// Launch the server with optional telemetry
BunRuntime.runMain(
  Layer.launch(ServerLive).pipe(
    Effect.provide(Layer.merge(TelemetryLive, LoggerLayer))
  )
)
