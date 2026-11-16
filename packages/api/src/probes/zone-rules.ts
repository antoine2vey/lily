import { BunRuntime } from '@effect/platform-bun'
import { ZoneRulesLive } from '@lily/api/layers/zone-rules'
import { Console, Effect, Layer } from 'effect'

// Builds the production startup guard against the zone rules the running Bun
// loaded. CI runs it inside the api image, with and without ICU_TIMEZONE_FILES_DIR.
// A failed guard ends the process non-zero and runMain prints the error.
BunRuntime.runMain(
  Layer.build(ZoneRulesLive).pipe(
    Effect.scoped,
    Effect.andThen(Console.log('zone rules ok'))
  )
)
