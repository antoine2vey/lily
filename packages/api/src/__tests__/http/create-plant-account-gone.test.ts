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
import { Effect, FileSystem, Layer, Path, Redacted } from 'effect'
import { Etag, HttpPlatform, HttpRouter } from 'effect/http'
import { HttpApi, HttpApiBuilder } from 'effect/http-api'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const purged = 'user-purged'
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
const care = createInMemoryCare([], {
  plantRows: rows,
  goneAccounts: [purged],
})

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

describe('creating a plant over HTTP once the account row is gone', () => {
  let web: ReturnType<typeof makeHandler>

  const create = async (userId: string) => {
    const res = await web.handler(
      new Request(`http://lily.test${API_PREFIX}/plants`, {
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
    const text = await res.text()
    expect(res.status, `HTTP ${res.status}: ${text}`).toBeLessThan(500)
    const body: { name?: string } = JSON.parse(text)
    return { status: res.status, body }
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
