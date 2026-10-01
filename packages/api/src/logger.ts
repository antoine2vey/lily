import { Logger, String as Str } from 'effect'

/**
 * Railway-compatible JSON logger.
 *
 * Railway parses structured JSON logs and reads the `level` field
 * (lowercase: debug, info, warn, error) to classify severity.
 * Effect's structured formatter emits `level` in uppercase, so it is
 * lowercased before serialization.
 *
 * Everything goes to stdout — Railway determines severity from the
 * `level` field in the JSON, not from stdout vs stderr.
 */
const railwayLogger = Logger.map(Logger.formatStructured, (entry) => {
  globalThis.console.log(
    JSON.stringify({ ...entry, level: Str.toLowerCase(entry.level) })
  )
})

// `Logger.layer` replaces the whole logger set, so `tracerLogger` is listed
// explicitly to keep log lines attached to the current span as events.
export const LoggerLayer =
  process.env.NODE_ENV === 'production'
    ? Logger.layer([railwayLogger, Logger.tracerLogger])
    : Logger.layer([Logger.consolePretty(), Logger.tracerLogger])
