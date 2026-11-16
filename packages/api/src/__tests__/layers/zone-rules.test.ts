import {
  StaleZoneRulesError,
  ZoneOffset,
  ZoneRulesLive,
} from '@lily/api/layers/zone-rules'
import { ServerLive } from '@lily/api/server'
import { ConfigProvider, Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const build = <A, E>(
  layer: Layer.Layer<A, E>,
  env: Record<string, string>,
  offset: string
) =>
  Layer.build(layer).pipe(
    Effect.scoped,
    Effect.provideService(ZoneOffset, () => offset),
    Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(env)))
  )

describe('ZoneRulesLive', () => {
  it('fails in production when the zone rules predate 2026b', async () => {
    const error = await Effect.runPromise(
      Effect.flip(build(ZoneRulesLive, { NODE_ENV: 'production' }, '-08:00'))
    )

    expect(error).toBeInstanceOf(StaleZoneRulesError)
    expect(error.message).toContain('scripts/update-icu-tzdata.sh')
  })

  it('starts in production when the zone rules are current', async () => {
    await Effect.runPromise(
      build(ZoneRulesLive, { NODE_ENV: 'production' }, '-07:00')
    )
  })

  it('skips the check outside production', async () => {
    await Effect.runPromise(
      build(ZoneRulesLive, { NODE_ENV: 'development' }, '-08:00')
    )
  })

  it('stops the server layer before anything else builds', async () => {
    const error = await Effect.runPromise(
      Effect.flip(build(ServerLive, { NODE_ENV: 'production' }, '-08:00'))
    )

    expect(error).toBeInstanceOf(StaleZoneRulesError)
  })
})
