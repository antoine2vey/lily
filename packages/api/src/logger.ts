import { Logger } from 'effect'

export const LoggerLayer =
  process.env.NODE_ENV === 'production'
    ? Logger.replace(
        Logger.defaultLogger,
        Logger.withLeveledConsole(Logger.jsonLogger)
      )
    : Logger.pretty
