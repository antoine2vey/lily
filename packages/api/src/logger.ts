import { Logger } from 'effect'

export const LoggerLayer = Logger.add(Logger.prettyLoggerDefault)
