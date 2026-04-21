import { DiscordAlerterLive } from '@lily/api/services/alerting/discord.provider'
import { Alerter } from '@lily/api/services/alerting/service'
import { ConfigProvider, Effect, Logger, LogLevel } from 'effect'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

type FetchArgs = [input: RequestInfo | URL, init?: RequestInit]

const configProvider = ConfigProvider.fromMap(
  new Map([
    ['DISCORD_WEBHOOK_URL', 'https://discord.example/webhook/abc'],
    ['ALERT_ENVIRONMENT_NAME', 'test'],
  ])
)

describe('DiscordAlerterLive', () => {
  const fetchCalls: FetchArgs[] = []
  const originalFetch = globalThis.fetch
  let nextResponse: Response

  beforeEach(() => {
    fetchCalls.length = 0
    nextResponse = new Response('ok', { status: 200 })
    globalThis.fetch = ((...args: FetchArgs) => {
      fetchCalls.push(args)
      return Promise.resolve(nextResponse)
    }) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  const run = <A, E>(eff: Effect.Effect<A, E, Alerter>) =>
    Effect.runPromise(
      eff.pipe(
        Effect.provide(DiscordAlerterLive),
        Effect.withConfigProvider(configProvider),
        Logger.withMinimumLogLevel(LogLevel.None)
      )
    )

  it('POSTs an embed payload to the webhook URL', async () => {
    await run(
      Effect.gen(function* () {
        const alerter = yield* Alerter
        yield* alerter.alert({
          _tag: 'HttpError5xx',
          method: 'POST',
          url: '/api/plants',
          status: 500,
        })
        // Allow the forked daemon to run
        yield* Effect.sleep('20 millis')
      })
    )

    expect(fetchCalls).toHaveLength(1)
    const [url, init] = fetchCalls[0]!
    expect(String(url)).toBe('https://discord.example/webhook/abc')
    expect(init?.method).toBe('POST')
    const body = JSON.parse(init?.body as string) as {
      embeds: Array<{ title: string; color: number; fields: unknown[] }>
    }
    expect(body.embeds).toHaveLength(1)
    expect(body.embeds[0]?.title).toContain('[test]')
    expect(body.embeds[0]?.title).toContain('500')
    expect(body.embeds[0]?.color).toBe(15158332) // red
  })

  it('sends warning alerts with yellow color', async () => {
    await run(
      Effect.gen(function* () {
        const alerter = yield* Alerter
        yield* alerter.alertWarning(
          'notification-worker',
          'push batch failed',
          { failed: 3 }
        )
        yield* Effect.sleep('20 millis')
      })
    )

    expect(fetchCalls).toHaveLength(1)
    const body = JSON.parse(fetchCalls[0]![1]?.body as string) as {
      embeds: Array<{ color: number; title: string }>
    }
    expect(body.embeds[0]?.color).toBe(15844367) // yellow
    expect(body.embeds[0]?.title).toContain('Warning')
  })

  it('swallows webhook failures so the caller is unaffected', async () => {
    nextResponse = new Response('rate limited', { status: 429 })

    // Does not throw.
    await run(
      Effect.gen(function* () {
        const alerter = yield* Alerter
        yield* alerter.alert({
          _tag: 'ProviderError',
          provider: 'openai',
          errorTag: 'OpenAIError',
          message: 'boom',
        })
        yield* Effect.sleep('20 millis')
      })
    )
    expect(fetchCalls).toHaveLength(1)
  })
})
