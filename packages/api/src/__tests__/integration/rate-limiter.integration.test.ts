import {
  RateLimiterService,
  RateLimiterServiceLive,
} from '@lily/api/services/rate-limiter/service'
import { DrizzleLive } from '@lily/db'
import {
  Array,
  Cause,
  ConfigProvider,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Option,
} from 'effect'
import { afterAll, describe, expect, it } from 'vitest'

const runtime = ManagedRuntime.make(
  RateLimiterServiceLive.pipe(
    Layer.provide(DrizzleLive),
    Layer.provide(
      ConfigProvider.layer(
        ConfigProvider.fromUnknown({
          DATABASE_URL: Option.getOrElse(
            Option.fromNullishOr(process.env.DATABASE_URL_TEST),
            () => ''
          ),
        })
      )
    )
  )
)

const check = (key: string, maxRequests: number, windowSeconds: number) =>
  Effect.gen(function* () {
    const limiter = yield* RateLimiterService
    return yield* limiter.checkRateLimit(key, { maxRequests, windowSeconds })
  })

const outcome = <E extends { readonly _tag: string }>(
  exit: Exit.Exit<void, E>
): string =>
  Exit.match(exit, {
    onSuccess: () => 'allowed',
    onFailure: (cause) =>
      Option.match(Cause.findErrorOption(cause), {
        onNone: () => 'defect',
        onSome: (error) => error._tag,
      }),
  })

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'RateLimiterService - Integration',
  () => {
    afterAll(async () => {
      await runtime.dispose()
    })

    it('allows exactly maxRequests out of 50 concurrent first requests, with no defects', async () => {
      const key = `rate-limit-burst-${crypto.randomUUID()}`

      const exits = await runtime.runPromise(
        Effect.all(
          Array.makeBy(50, () => Effect.exit(check(key, 3, 60))),
          { concurrency: 'unbounded' }
        )
      )

      const outcomes = Array.map(exits, outcome)
      expect(Array.filter(outcomes, (o) => o === 'allowed')).toHaveLength(3)
      expect(
        Array.filter(outcomes, (o) => o === 'RateLimitExceededError')
      ).toHaveLength(47)
    })

    it('starts a new window once the previous one has expired', async () => {
      const key = `rate-limit-window-${crypto.randomUUID()}`

      const first = await runtime.runPromiseExit(check(key, 1, 1))
      const second = await runtime.runPromiseExit(check(key, 1, 1))
      await new Promise((resolve) => setTimeout(resolve, 1100))
      const third = await runtime.runPromiseExit(check(key, 1, 1))

      expect(Array.map([first, second, third], outcome)).toEqual([
        'allowed',
        'RateLimitExceededError',
        'allowed',
      ])
    })
  }
)
