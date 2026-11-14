import { mockRooms } from '@lily/api/__tests__/fixtures/rooms'
import { mockUserProfile } from '@lily/api/__tests__/mocks/auth'
import { createMockRoomRepository } from '@lily/api/__tests__/mocks/room.repository'
import { Api } from '@lily/api/api'
import { GlobalRouterMiddleware } from '@lily/api/middleware/router'
import {
  Authentication,
  CurrentUser,
} from '@lily/api/services/auth/middleware.types'
import { RoomsApiLive } from '@lily/api/services/rooms/handlers'
import { API_PREFIX } from '@lily/shared'
import { Effect, FileSystem, Layer, Path, Redacted } from 'effect'
import {
  Etag,
  HttpPlatform,
  HttpRouter,
  type HttpServerRequest,
  HttpServerResponse,
} from 'effect/http'
import { HttpApi, HttpApiBuilder } from 'effect/http-api'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const TestApi = HttpApi.make('legacyApiPrefix').add(Api.groups.rooms)

const AuthLive = Layer.succeed(
  Authentication,
  Authentication.of({
    bearer: (httpEffect, { credential }) =>
      Effect.provideService(httpEffect, CurrentUser, {
        ...mockUserProfile,
        id: Redacted.value(credential),
      }),
  })
)

const PlatformLive = Layer.mergeAll(
  Path.layer,
  Etag.layer,
  HttpPlatform.layer
).pipe(Layer.provideMerge(FileSystem.layerNoop({})))

const echoUrl = (request: HttpServerRequest.HttpServerRequest) =>
  Effect.succeed(HttpServerResponse.text(request.url))

const makeHandler = () =>
  HttpRouter.toWebHandler(
    Layer.mergeAll(
      HttpApiBuilder.layer(TestApi).pipe(
        Layer.provide(RoomsApiLive(TestApi as unknown as Api)),
        Layer.provide(AuthLive),
        Layer.provide(createMockRoomRepository(mockRooms)),
        Layer.provide(PlatformLive)
      ),
      HttpRouter.add('GET', `${API_PREFIX}/echo`, echoUrl),
      HttpRouter.add('GET', '/apiary', echoUrl),
      HttpRouter.add('GET', '/health', echoUrl),
      GlobalRouterMiddleware
    ) as unknown as Layer.Layer<never>,
    { disableLogger: true }
  )

describe('legacy /api prefix over HTTP', () => {
  let web: ReturnType<typeof makeHandler>

  const get = async (path: string) => {
    const res = await web.handler(
      new Request(`http://lily.test${path}`, {
        headers: { Authorization: `Bearer ${mockUserProfile.id}` },
      })
    )
    return { status: res.status, body: await res.text() }
  }

  beforeAll(() => {
    web = makeHandler()
  })

  afterAll(async () => {
    await web.dispose()
  })

  it('serves a real route under the versioned prefix', async () => {
    const res = await get(`${API_PREFIX}/rooms`)
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body)).toMatchObject([
      { id: 'room-1' },
      { id: 'room-2' },
    ])
  })

  it('answers the unversioned path from the same handler', async () => {
    const versioned = await get(`${API_PREFIX}/rooms?includeCanopy=true`)
    const legacy = await get('/api/rooms?includeCanopy=true')
    expect(legacy).toEqual(versioned)
  })

  it('hands the rewritten URL, query included, to the route', async () => {
    const res = await get('/api/echo?page=2&limit=20')
    expect(res).toEqual({
      status: 200,
      body: `${API_PREFIX}/echo?page=2&limit=20`,
    })
  })

  it.each(['/apiary', '/health?probe=1'])(
    'leaves %s untouched',
    async (path) => {
      const res = await get(path)
      expect(res).toEqual({ status: 200, body: path })
    }
  )
})
