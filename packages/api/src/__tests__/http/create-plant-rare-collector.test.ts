import { createMockAiService } from '@lily/api/__tests__/mocks/ai.service'
import { mockUserProfile } from '@lily/api/__tests__/mocks/auth'
import { createInMemoryCanopy } from '@lily/api/__tests__/mocks/canopy'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createInMemoryCare } from '@lily/api/__tests__/mocks/care'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockFileService } from '@lily/api/__tests__/mocks/file.service'
import {
  createInMemoryGCS,
  MOCK_BUCKET_NAMES,
} from '@lily/api/__tests__/mocks/gcs.service'
import { MockLimitCheckerLive } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockRareIdentificationRepository } from '@lily/api/__tests__/mocks/rare-identification.repository'
import { createMockRoomRepository } from '@lily/api/__tests__/mocks/room.repository'
import { createMockScanRepository } from '@lily/api/__tests__/mocks/scan.repository'
import { createMockUsageTracker } from '@lily/api/__tests__/mocks/usage-tracker'
import { Api } from '@lily/api/api'
import type { AppEvent } from '@lily/api/events'
import {
  Authentication,
  CurrentUser,
} from '@lily/api/services/auth/middleware.types'
import { PlantsApi } from '@lily/api/services/plants/api'
import { PlantsApiLive } from '@lily/api/services/plants/handlers'
import type { plants } from '@lily/db/schema'
import { API_PREFIX } from '@lily/shared'
import { Array, Effect, FileSystem, Layer, Path, Redacted } from 'effect'
import { Etag, HttpPlatform, HttpRouter } from 'effect/http'
import { HttpApi, HttpApiBuilder } from 'effect/http-api'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const alex = 'user-alex'
const rareUrl = 'https://storage.googleapis.com/mock-bucket/identify/rare.jpg'
const commonUrl =
  'https://storage.googleapis.com/mock-bucket/identify/common.jpg'
const scanKey = `users/${alex}/detect/rare-scan.jpg`
const scanUrl = `https://storage.googleapis.com/${MOCK_BUCKET_NAMES.ai}/${scanKey}?X-Goog-Signature=abc`

const gcs = createInMemoryGCS()
gcs.objects.ai.add(scanKey)

const TestApi = HttpApi.make('Api').add(Api.groups.plants)

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
    { userId: alex, imageUrl: scanUrl },
  ]),
  gcs.layer,
  createMockEventBus({ publishedEvents }),
  createInMemoryCanopy().layer,
  MockLimitCheckerLive,
  createInMemoryCare([], { plantRows: rows }).layer,
  createMockAiService(),
  createMockDelegationRepository({}),
  createMockFileService(),
  createMockScanRepository(),
  createMockUsageTracker({ limitReached: false }),
  FileSystem.layerNoop({})
)

const PlatformLive = Layer.mergeAll(
  Path.layer,
  Etag.layer,
  HttpPlatform.layer
).pipe(Layer.provideMerge(FileSystem.layerNoop({})))

const makeHandler = () =>
  HttpRouter.toWebHandler(
    HttpApiBuilder.layer(TestApi).pipe(
      Layer.provide(PlantsApiLive(Api)),
      Layer.provide(AuthLive),
      HttpRouter.provideRequest(DependenciesLive),
      Layer.provide(PlatformLive)
    ),
    { disableLogger: true }
  )

describe('saving an identified plant over HTTP', () => {
  let web: ReturnType<typeof makeHandler>

  const save = async (imageUrl: string | undefined) => {
    const res = await web.handler(
      new Request(`http://lily.test${API_PREFIX}/plants`, {
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
      imageUrl: body.imageUrl,
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

  it('publishes RarePlantIdentified for a rare scan photo the plant gets a public copy of', async () => {
    const saved = await save(scanUrl)

    expect({
      status: saved.status,
      imageUrl: saved.imageUrl,
      rare: saved.rare,
    }).toEqual({
      status: 201,
      imageUrl: expect.stringContaining(
        `/${MOCK_BUCKET_NAMES.plant}/plants/${saved.plantId}/`
      ),
      rare: [
        { _tag: 'RarePlantIdentified', userId: alex, plantId: saved.plantId },
      ],
    })
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
