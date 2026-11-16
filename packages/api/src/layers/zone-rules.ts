import { Config, Context, DateTime, Effect, Layer, Schema } from 'effect'

// British Columbia has kept UTC-07:00 all year since IANA 2026b. ICU data older
// than that, such as the data Bun bundles, gives -08:00 here.
const ZONE = 'America/Vancouver'
const INSTANT = '2027-01-15T12:00:00Z'
const OFFSET = '-07:00'

export class StaleZoneRulesError extends Schema.TaggedError<StaleZoneRulesError>()(
  'StaleZoneRulesError',
  { message: Schema.String }
) {}

/** Where the check reads a zone's offset. Tests swap in stale rules. */
export const ZoneOffset = Context.Reference<
  (instant: string, timeZone: string) => string
>('@lily/api/ZoneOffset', {
  defaultValue: () => (instant, timeZone) =>
    DateTime.zonedOffsetIso(DateTime.makeZonedUnsafe(instant, { timeZone })),
})

/**
 * Stops a production api whose ICU did not load the zone rules in
 * packages/db/icu-tzdata. Without them Bun falls back, with no error, to rules
 * older than the database's, and local days drift an hour apart.
 */
export const ZoneRulesLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const nodeEnv = yield* Config.String('NODE_ENV').pipe(
      Config.withDefault('development')
    )
    if (nodeEnv !== 'production') {
      return
    }
    const offset = (yield* ZoneOffset)(INSTANT, ZONE)
    if (offset === OFFSET) {
      return
    }
    const dir = yield* Config.String('ICU_TIMEZONE_FILES_DIR').pipe(
      Config.withDefault('unset')
    )
    return yield* new StaleZoneRulesError({
      message: `ICU gives ${ZONE} ${offset} at ${INSTANT}, where IANA 2026b and later give ${OFFSET}. ICU_TIMEZONE_FILES_DIR is ${dir}. It must name the copy of packages/db/icu-tzdata that Dockerfile.prod puts in the image, and scripts/update-icu-tzdata.sh <release> refreshes that folder.`,
    })
  })
)
