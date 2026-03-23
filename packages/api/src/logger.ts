import { Logger, String as Str } from 'effect'

/**
 * Railway-compatible JSON logger.
 *
 * Railway parses structured JSON logs and reads the `level` field
 * (lowercase: debug, info, warn, error) to classify severity.
 * Effect's `Logger.jsonLogger` outputs `logLevel` with uppercase labels,
 * so we replace `"logLevel":"INFO"` → `"level":"info"` etc.
 *
 * Everything goes to stdout — Railway determines severity from the
 * `level` field in the JSON, not from stdout vs stderr.
 */
const railwayLogger = Logger.make((options: Logger.Logger.Options<unknown>) => {
  const json = Logger.jsonLogger.log(options)
  const output = json.replace(
    `"logLevel":"${options.logLevel.label}"`,
    `"level":"${Str.toLowerCase(options.logLevel.label)}"`
  )
  globalThis.console.log(output)
})

export const LoggerLayer =
  process.env.NODE_ENV === 'production'
    ? Logger.replace(Logger.defaultLogger, railwayLogger)
    : Logger.pretty
