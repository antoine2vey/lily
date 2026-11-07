import { makePlant } from '@lily/mcp/__tests__/mocks/plant'
import { ApiClient, ApiClientLive, CurrentJwt } from '@lily/mcp/api-client'
import { ExternalServiceError } from '@lily/shared'
import { Plant } from '@lily/shared/plant'
import { ConfigProvider, Effect, Layer, Schema } from 'effect'
import { FetchHttpClient } from 'effect/http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const requests: Request[] = []

const endpointBody = (request: Request): unknown =>
  request.method === 'POST'
    ? Schema.encodeSync(Schema.toCodecJson(Plant))(makePlant())
    : {
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        hasMore: false,
        overdue: [],
        today: [],
        upcoming: [],
        completedToday: 0,
        windowDays: [],
      }

let responseBody = endpointBody

beforeEach(() => {
  requests.length = 0
  responseBody = endpointBody
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      return Promise.resolve(Response.json(responseBody(request)))
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

describe('MCP API client response decoding', () => {
  it('fails with ExternalServiceError when the API body does not match the endpoint schema', async () => {
    responseBody = () => ({ overdue: 'nope' })

    const error = await run((api) => api.getCareTasks().pipe(Effect.flip))

    expect(error).toBeInstanceOf(ExternalServiceError)
    expect(error.url).toBe('http://api.test/api/care-tasks?includeCanopy=true')
  })
})

describe('MCP API client plant id path segment', () => {
  const traversal = '../canopies/me/leave#'
  const plantId = '3f2b8c1e-5d4a-4b7e-9c0d-1a2b3c4d5e6f'

  const calls: ReadonlyArray<
    readonly [
      string,
      (
        api: typeof ApiClient.Service
      ) => Effect.Effect<unknown, unknown, CurrentJwt>,
    ]
  > = [
    ['getPlant', (api: typeof ApiClient.Service) => api.getPlant(traversal)],
    [
      'getCareLogs',
      (api: typeof ApiClient.Service) => api.getCareLogs(traversal),
    ],
    [
      'carePlant',
      (api: typeof ApiClient.Service) =>
        api.carePlant(traversal, { careType: 'watering' }),
    ],
  ]

  it.each(calls)(
    '%s keeps a traversal id inside /api/plants/',
    async (_name, call) => {
      await run((api) => Effect.exit(call(api)))

      const { pathname } = new URL(requests[0]?.url ?? '')
      expect(pathname.startsWith('/api/plants/')).toBe(true)
      expect(pathname).not.toContain('/canopies/')
    }
  )

  it('carePlant posts a valid id to /api/plants/<id>/care', async () => {
    await run((api) => api.carePlant(plantId, { careType: 'watering' }))

    expect(new URL(requests[0]?.url ?? '').pathname).toBe(
      `/api/plants/${plantId}/care`
    )
  })
})
