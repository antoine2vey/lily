import { mockUserProfile } from '@lily/api/__tests__/mocks/auth'
import { createInMemoryCanopy } from '@lily/api/__tests__/mocks/canopy'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createInMemoryCare } from '@lily/api/__tests__/mocks/care'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { MockLimitCheckerLive } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockRareIdentificationRepository } from '@lily/api/__tests__/mocks/rare-identification.repository'
import { createMockRoomRepository } from '@lily/api/__tests__/mocks/room.repository'
import type { Api } from '@lily/api/api'
import type { AppEvent } from '@lily/api/events'
import {
  Authentication,
  CurrentUser,
} from '@lily/api/services/auth/middleware.types'
import { PlantsApi } from '@lily/api/services/plants/api'
import { PlantsApiLive } from '@lily/api/services/plants/handlers'
import type { plants } from '@lily/db/schema'
import { Array, Effect, FileSystem, Layer, Path, Redacted } from 'effect'
import { Etag, HttpPlatform, HttpRouter } from 'effect/http'
import { HttpApi, HttpApiBuilder } from 'effect/http-api'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const alex = 'user-alex'
const rareUrl = 'https://storage.googleapis.com/mock-bucket/identify/rare.jpg'
const commonUrl =
  'https://storage.googleapis.com/mock-bucket/identify/common.jpg'

const TestApi = HttpApi.make('createPlantRareCollector').add(PlantsApi)

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
const publishedEvents: AppEvent[] = []

const DependenciesLive = Layer.mergeAll(
  createMockRoomRepository([]),
  createMockPlantRepository({ plants: rows, sharesPlantsArray: true }),
  createMockCanopyRepository(),
  createMockRareIdentificationRepository([
    { userId: alex, imageUrl: rareUrl },
    { userId: alex, imageUrl: '' },
  ]),
  createMockEventBus({ publishedEvents }),
  createInMemoryCanopy().layer,
  MockLimitCheckerLive,
  createInMemoryCare([], { plantRows: rows }).layer
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

describe('saving an identified plant over HTTP', () => {
  let web: ReturnType<typeof makeHandler>

  const save = async (imageUrl: string | undefined) => {
    const res = await web.handler(
      new Request('http://lily.test/plants', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${alex}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Monstera obliqua',
          imageUrl,
          wateringFrequencyDays: 7,
          luxNeeded: 2000,
          petToxicityRating: 3,
        }),
      })
    )
    const body = await res.json()
    return {
      status: res.status,
      plantId: body.id,
      rare: Array.filter(
        publishedEvents,
        (event) => event._tag === 'RarePlantIdentified'
      ),
    }
  }

  beforeAll(() => {
    web = makeHandler()
  })

  beforeEach(() => {
    publishedEvents.length = 0
  })

  afterAll(async () => {
    await web.dispose()
  })

  it('publishes RarePlantIdentified for a photo identified as rare', async () => {
    const saved = await save(rareUrl)

    expect(saved.status).toBe(201)
    expect(saved.plantId).toEqual(expect.any(String))
    expect(saved.rare).toEqual([
      { _tag: 'RarePlantIdentified', userId: alex, plantId: saved.plantId },
    ])
  })

  it('publishes nothing for a photo that was not identified as rare', async () => {
    const saved = await save(commonUrl)

    expect({ status: saved.status, rare: saved.rare }).toEqual({
      status: 201,
      rare: [],
    })
  })

  it('publishes nothing for an empty image URL', async () => {
    const saved = await save('')

    expect({ status: saved.status, rare: saved.rare }).toEqual({
      status: 201,
      rare: [],
    })
  })

  it('publishes nothing for a plant saved without a photo', async () => {
    const saved = await save(undefined)

    expect({ status: saved.status, rare: saved.rare }).toEqual({
      status: 201,
      rare: [],
    })
  })
})
