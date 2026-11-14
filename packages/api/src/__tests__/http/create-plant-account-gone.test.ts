import { mockUserProfile } from '@lily/api/__tests__/mocks/auth'
import { createInMemoryCanopy } from '@lily/api/__tests__/mocks/canopy'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createInMemoryCare } from '@lily/api/__tests__/mocks/care'
import { MockLimitCheckerLive } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockRoomRepository } from '@lily/api/__tests__/mocks/room.repository'
import type { Api } from '@lily/api/api'
import {
  Authentication,
  CurrentUser,
} from '@lily/api/services/auth/middleware.types'
import { PlantsApi } from '@lily/api/services/plants/api'
import { PlantsApiLive } from '@lily/api/services/plants/handlers'
import type { plants } from '@lily/db/schema'
import { Effect, FileSystem, Layer, Path, Redacted } from 'effect'
import { Etag, HttpPlatform, HttpRouter } from 'effect/http'
import { HttpApi, HttpApiBuilder } from 'effect/http-api'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const purged = 'user-purged'
const alex = 'user-alex'

const TestApi = HttpApi.make('createPlantAccountGone').add(PlantsApi)

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

const rows: Array<typeof plants.$inferSelect> = []
const care = createInMemoryCare([], {
  plantRows: rows,
  goneAccounts: [purged],
})

const DependenciesLive = Layer.mergeAll(
  createMockRoomRepository([]),
  createMockPlantRepository({ plants: rows, sharesPlantsArray: true }),
  createMockCanopyRepository(),
  createInMemoryCanopy().layer,
  MockLimitCheckerLive,
  care.layer
)

const PlatformLive = Layer.mergeAll(
  Path.layer,
  Etag.layer,
  HttpPlatform.layer
).pipe(Layer.provideMerge(FileSystem.layerNoop({})))

const makeHandler = () =>
  HttpRouter.toWebHandler(
    HttpApiBuilder.layer(TestApi).pipe(
      Layer.provide(PlantsApiLive(TestApi as unknown as Api)),
      Layer.provide(AuthLive),
      Layer.provide(DependenciesLive),
      Layer.provide(PlatformLive)
    ) as unknown as Layer.Layer<never>,
    { disableLogger: true }
  )

describe('creating a plant over HTTP once the account row is gone', () => {
  let web: ReturnType<typeof makeHandler>

  const create = async (userId: string) => {
    const res = await web.handler(
      new Request('http://lily.test/plants', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userId}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Fern',
          wateringFrequencyDays: 7,
          luxNeeded: 2000,
          petToxicityRating: 1,
        }),
      })
    )
    return { status: res.status, body: await res.json() }
  }

  beforeAll(() => {
    web = makeHandler()
  })

  afterAll(async () => {
    await web.dispose()
  })

  it('answers the 401 of a request with no account behind it', async () => {
    expect(await create(purged)).toEqual({
      status: 401,
      body: { _tag: 'UnauthorizedError', message: 'Authentication failed' },
    })
    expect(care.writes).toEqual([])
  })

  it('still creates the plant of an account that exists', async () => {
    const res = await create(alex)

    expect({ status: res.status, name: res.body.name }).toEqual({
      status: 201,
      name: 'Fern',
    })
  })
})
