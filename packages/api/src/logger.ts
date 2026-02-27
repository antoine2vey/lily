import { Logger } from 'effect'

export const LoggerLayer =
  process.env.NODE_ENV === 'production' ? Logger.json : Logger.pretty
