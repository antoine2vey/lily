import { Config, Effect, Layer, Logger } from 'effect'

export const LoggerLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const nodeEnv = yield* Config.withDefault(
      Config.string('NODE_ENV'),
      'development'
    )

    return nodeEnv === 'production' ? Logger.json : Logger.pretty
  })
)
