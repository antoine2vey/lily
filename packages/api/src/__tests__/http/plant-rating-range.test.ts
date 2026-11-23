import { BunFileSystem, BunPath } from '@effect/platform-bun'
import { createMockAiService } from '@lily/api/__tests__/mocks/ai.service'
import { mockUserProfile } from '@lily/api/__tests__/mocks/auth'
import { createInMemoryCanopy } from '@lily/api/__tests__/mocks/canopy'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createInMemoryCare } from '@lily/api/__tests__/mocks/care'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockFileService } from '@lily/api/__tests__/mocks/file.service'
import { createMockGCSService } from '@lily/api/__tests__/mocks/gcs.service'
import { MockLimitCheckerLive } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockRareIdentificationRepository } from '@lily/api/__tests__/mocks/rare-identification.repository'
import { createMockRoomRepository } from '@lily/api/__tests__/mocks/room.repository'
import { createMockScanRepository } from '@lily/api/__tests__/mocks/scan.repository'
import { createMockStoredRefRepository } from '@lily/api/__tests__/mocks/stored-ref.repository'
import { createMockUsageTracker } from '@lily/api/__tests__/mocks/usage-tracker'
import { Api } from '@lily/api/api'
import {
  Authentication,
  CurrentUser,
} from '@lily/api/services/auth/middleware.types'
import { PlantsApiLive } from '@lily/api/services/plants/handlers'
import type { plants } from '@lily/db/schema'
import { API_PREFIX } from '@lily/shared'
import { Effect, Layer, Redacted } from 'effect'
import { Etag, HttpPlatform, HttpRouter } from 'effect/http'
import { HttpApi, HttpApiBuilder } from 'effect/http-api'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const alex = 'user-alex'

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
const care = createInMemoryCare([], { plantRows: rows })

const DependenciesLive = Layer.mergeAll(
  createMockStoredRefRepository(),
  createMockGCSService(),
  createMockRoomRepository([]),
  createMockPlantRepository({ plants: rows, sharesPlantsArray: true }),
  createMockCanopyRepository(),
  createMockRareIdentificationRepository([]),
  createMockEventBus(),
  createInMemoryCanopy().layer,
  MockLimitCheckerLive,
  care.layer,
  createMockAiService(),
  createMockDelegationRepository({}),
  createMockFileService,
  createMockScanRepository,
  createMockUsageTracker({ limitReached: false }),
  BunFileSystem.layer
)

const PlatformLive = Layer.mergeAll(
  BunPath.layer,
  Etag.layer,
  HttpPlatform.layer
).pipe(Layer.provideMerge(BunFileSystem.layer))

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

const fern = {
  name: 'Fern',
  wateringFrequencyDays: 7,
  luxNeeded: 2000,
  petToxicityRating: 0,
}

describe('plant ratings over HTTP', () => {
  let web: ReturnType<typeof makeHandler>

  const send = async (method: 'POST' | 'PUT', path: string, body: BodyInit) => {
    const res = await web.handler(
      new Request(`http://lily.test${API_PREFIX}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${alex}`,
          ...(typeof body === 'string'
            ? { 'Content-Type': 'application/json' }
            : {}),
        },
        body,
      })
    )
    return { status: res.status, text: await res.text() }
  }

  const create = (payload: object) =>
    send('POST', '/plants', JSON.stringify({ ...fern, ...payload }))

  beforeAll(() => {
    web = makeHandler()
  })

  afterAll(async () => {
    await web.dispose()
  })

  it('stores a chosen 0 and sends each rating back as a plain JSON number', async () => {
    const res = await create({ humidityRating: 0, wateringRating: 100 })

    expect(res.status, res.text).toBe(201)
    expect(JSON.parse(res.text)).toMatchObject({
      humidityRating: 0,
      petToxicityRating: 0,
      wateringRating: 100,
    })
    expect(res.text).toContain('"humidityRating":0')
  })

  it.each([
    ['above 100', { humidityRating: 101 }],
    ['below 0', { wateringRating: -1 }],
    ['between two steps', { lightingRating: 45.5 }],
    ['a required rating off the scale', { petToxicityRating: 150 }],
  ])('answers 400 for a create with a rating %s', async (_, payload) => {
    const before = care.writes.length
    const res = await create(payload)

    expect(res.status, res.text).toBe(400)
    expect(care.writes).toHaveLength(before)
  })

  it('answers 400 for an update with a rating off the scale', async () => {
    const form = new FormData()
    form.append('data', JSON.stringify({ humidityRating: 101 }))
    const res = await send('PUT', `/plants/${crypto.randomUUID()}`, form)

    expect(res.status, res.text).toBe(400)
  })
})
