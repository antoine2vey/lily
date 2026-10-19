import { ApiClient, ApiClientLive, CurrentJwt } from '@lily/mcp/api-client'
import { ExternalServiceError } from '@lily/shared'
import {
  ConfigProvider,
  Duration,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
} from 'effect'
import { FetchHttpClient } from 'effect/http'
import { TestClock } from 'effect/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const signals: AbortSignal[] = []

beforeEach(() => {
  signals.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: unknown, init?: RequestInit) => {
      if (init?.signal) signals.push(init.signal)
      return new Promise<never>(() => {})
    })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const ApiClientTest = ApiClientLive.pipe(
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(
    ConfigProvider.layer(
      ConfigProvider.fromUnknown({
        API_BASE_URL: 'http://api.test',
        SERVICE_TOKEN_SECRET: 'secret',
      })
    )
  )
)

const cases: ReadonlyArray<{
  readonly name: string
  readonly call: (
    api: typeof ApiClient.Service
  ) => Effect.Effect<unknown, ExternalServiceError, CurrentJwt>
  readonly deadline: Duration.Duration
}> = [
  {
    name: 'internal sendMagicLink',
    call: (api) =>
      api.sendMagicLink({ email: 'a@example.com', callbackUrl: 'x' }),
    deadline: Duration.seconds(15),
  },
  {
    name: 'authed listPlants',
    call: (api) => api.listPlants(),
    deadline: Duration.seconds(15),
  },
  {
    name: 'authed queryKnowledge',
    call: (api) => api.queryKnowledge('why are my leaves yellow?'),
    deadline: Duration.seconds(45),
  },
  {
    name: 'unauthenticated refreshToken',
    call: (api) => api.refreshToken('refresh'),
    deadline: Duration.seconds(15),
  },
]

describe('MCP API client against an API that never responds', () => {
  it.each(cases)(
    '$name fails with ExternalServiceError and aborts the request',
    ({ call, deadline }) =>
      Effect.gen(function* () {
        const api = yield* ApiClient
        const fiber = yield* Effect.forkChild(
          call(api).pipe(Effect.provideService(CurrentJwt, 'jwt'))
        )

        yield* TestClock.adjust(
          Duration.subtract(deadline, Duration.seconds(1))
        )
        expect(fiber.pollUnsafe()).toBeUndefined()
        expect(signals).toHaveLength(1)
        expect(signals[0]?.aborted).toBe(false)

        yield* TestClock.adjust(Duration.seconds(1))
        const exit = yield* Fiber.await(fiber)

        const error = Exit.findErrorOption(exit).pipe(Option.getOrUndefined)
        expect(error).toBeInstanceOf(ExternalServiceError)
        expect(signals[0]?.aborted).toBe(true)
      }).pipe(
        Effect.provide(Layer.merge(ApiClientTest, TestClock.layer())),
        Effect.runPromise
      )
  )
})
