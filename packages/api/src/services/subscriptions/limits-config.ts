import { Config, Effect } from 'effect'

export const DisableLimitsConfig = Config.Boolean('DISABLE_LIMITS').pipe(
  Config.withDefault(false)
)

export const NodeEnvConfig = Config.String('NODE_ENV').pipe(
  Config.withDefault('development')
)

export const limitsDisabled = Effect.gen(function* () {
  const disableLimits = yield* DisableLimitsConfig
  const nodeEnv = yield* NodeEnvConfig
  return disableLimits && nodeEnv !== 'production'
})
