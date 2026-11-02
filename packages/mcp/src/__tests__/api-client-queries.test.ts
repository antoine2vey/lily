import { ApiClient, ApiClientLive, CurrentJwt } from '@lily/mcp/api-client'
import { ConfigProvider, Effect, Layer } from 'effect'
import { FetchHttpClient } from 'effect/http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const requests: Request[] = []

beforeEach(() => {
  requests.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init))
      return Promise.resolve(
        Response.json({ items: [], overdue: [], today: [], upcoming: [] })
      )
    })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const run = <A, E>(
  call: (api: typeof ApiClient.Service) => Effect.Effect<A, E, CurrentJwt>
) =>
  Effect.gen(function* () {
    return yield* call(yield* ApiClient)
  }).pipe(
    Effect.provideService(CurrentJwt, 'jwt'),
    Effect.provide(
      ApiClientLive.pipe(
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
    ),
    Effect.runPromise
  )

const sentQuery = () =>
  Object.fromEntries(new URL(requests[0]?.url ?? 'http://none').searchParams)

describe('MCP API client plant scope', () => {
  it('asks GET /plants for delegated and Canopy plants on every call', async () => {
    await run((api) => api.listPlants({ filter: 'overdue', limit: '100' }))

    expect(sentQuery()).toEqual({
      includeCaretaking: 'true',
      includeCanopy: 'true',
      filter: 'overdue',
      limit: '100',
    })
  })

  it('asks GET /care-tasks for Canopy tasks', async () => {
    await run((api) => api.getCareTasks())

    expect(new URL(requests[0]?.url ?? '').pathname).toBe('/api/care-tasks')
    expect(sentQuery()).toEqual({ includeCanopy: 'true' })
  })

  it('sends the plant owner in the POST /plants body', async () => {
    await run((api) =>
      api.createPlant({
        name: 'Fern',
        wateringFrequencyDays: 7,
        luxNeeded: 2000,
        petToxicityRating: 100,
        owner: 'canopy',
      })
    )

    expect(requests[0]?.method).toBe('POST')
    expect(new URL(requests[0]?.url ?? '').pathname).toBe('/api/plants')
    expect(await requests[0]?.json()).toMatchObject({ owner: 'canopy' })
  })
})
