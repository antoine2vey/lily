import { ZoneRulesLive } from '@lily/api/layers/zone-rules'
import { Effect, Layer } from 'effect'

// Builds the production startup guard against the zone rules the running Bun
// loaded. CI runs it inside the api image, with and without ICU_TIMEZONE_FILES_DIR.
const probe = Layer.build(ZoneRulesLive).pipe(
  Effect.scoped,
  Effect.match({
    onSuccess: () => {
      console.log('zone rules ok')
    },
    onFailure: (error) => {
      console.error(String(error))
      process.exitCode = 1
    },
  })
)

Effect.runPromise(probe)
