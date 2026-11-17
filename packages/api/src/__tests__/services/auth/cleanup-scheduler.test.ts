import { MagicLinkRepository } from '@lily/api/repositories/magic-link.repository'
import { RefreshTokenRepository } from '@lily/api/repositories/refresh-token.repository'
import { startAuthCleanupScheduler } from '@lily/api/services/auth/cleanup-scheduler'
import { type Duration, Effect, Layer, References } from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect, it } from 'vitest'

const signInTables = () => {
  const sweeps = { magicLinks: 0, refreshTokens: 0 }

  const layer = Layer.mergeAll(
    Layer.mock(MagicLinkRepository, {
      deleteExpired: () =>
        Effect.sync(() => {
          sweeps.magicLinks++
          return 0
        }),
    }),
    Layer.mock(RefreshTokenRepository, {
      deleteExpired: () =>
        Effect.sync(() => {
          sweeps.refreshTokens++
          return 0
        }),
    })
  )

  return { layer, sweeps }
}

const runApiFor = (
  layer: ReturnType<typeof signInTables>['layer'],
  lifetime: Duration.Input
) =>
  Effect.scoped(
    Effect.andThen(
      Layer.build(
        Layer.effectDiscard(startAuthCleanupScheduler).pipe(
          Layer.provide(layer)
        )
      ),
      TestClock.adjust(lifetime)
    )
  ).pipe(
    Effect.provide(TestClock.layer()),
    Effect.provideService(References.MinimumLogLevel, 'None'),
    Effect.runPromise
  )

describe('auth-cleanup scheduler', () => {
  it('deletes expired magic links and refresh tokens as soon as the API starts', async () => {
    const tables = signInTables()

    await runApiFor(tables.layer, '1 second')

    expect(tables.sweeps).toEqual({ magicLinks: 1, refreshTokens: 1 })
  })

  it('deletes them again every hour', async () => {
    const tables = signInTables()

    await runApiFor(tables.layer, '2 hours')

    expect(tables.sweeps).toEqual({ magicLinks: 3, refreshTokens: 3 })
  })
})
