import { BunFileSystem, BunPath } from '@effect/platform-bun'
import { createTestCarePlant } from '@lily/api/__tests__/fixtures/care-plants'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { createMockAiService } from '@lily/api/__tests__/mocks/ai.service'
import { mockUserProfile } from '@lily/api/__tests__/mocks/auth'
import { createInMemoryCanopy } from '@lily/api/__tests__/mocks/canopy'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createInMemoryCare } from '@lily/api/__tests__/mocks/care'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockFileService } from '@lily/api/__tests__/mocks/file.service'
import { createInMemoryGCS } from '@lily/api/__tests__/mocks/gcs.service'
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
import { CareLogsApiLive } from '@lily/api/services/care-logs/handlers'
import { PlantsApiLive } from '@lily/api/services/plants/handlers'
import { API_PREFIX } from '@lily/shared'
import { Array, Effect, Layer, Redacted, String } from 'effect'
import { Etag, HttpPlatform, HttpRouter } from 'effect/http'
import { HttpApi, HttpApiBuilder } from 'effect/http-api'
import { afterEach, describe, expect, it } from 'vitest'

const alex = 'user-alex'
const sam = 'user-sam'

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
  BunPath.layer,
  Etag.layer,
  HttpPlatform.layer
).pipe(Layer.provideMerge(BunFileSystem.layer))

const TestApi = HttpApi.make('Api')
  .add(Api.groups.careLogs)
  .add(Api.groups.plants)

const disposals: Array<() => Promise<void>> = []

afterEach(async () => {
  await Promise.all(disposals.splice(0).map((dispose) => dispose()))
})

const worldWith = (plant: ReturnType<typeof createTestPlant>) => {
  const care = createInMemoryCare([
    createTestCarePlant(plant.id, {
      owner: { _tag: 'User', userId: plant.userId ?? '' },
    }),
  ])
  const web = HttpRouter.toWebHandler(
    HttpApiBuilder.layer(TestApi).pipe(
      Layer.provide(CareLogsApiLive(Api)),
      Layer.provide(PlantsApiLive(Api)),
      Layer.provide(AuthLive),
      HttpRouter.provideRequest(
        Layer.mergeAll(
          createMockStoredRefRepository(),
          createMockRoomRepository([]),
          createMockPlantRepository({ plants: [plant] }),
          createMockCanopyRepository([]),
          createMockDelegationRepository({}),
          createMockCareLogRepository([]),
          createMockRareIdentificationRepository([]),
          createInMemoryGCS().layer,
          createMockEventBus(),
          createInMemoryCanopy().layer,
          MockLimitCheckerLive,
          care.layer,
          createMockAiService(),
          createMockFileService,
          createMockScanRepository,
          createMockUsageTracker({ limitReached: false }),
          BunFileSystem.layer
        )
      ),
      Layer.provide(PlatformLive)
    ),
    { disableLogger: true }
  )
  disposals.push(web.dispose)

  const call = async (user: string, method: 'GET' | 'DELETE', id: string) => {
    const response = await web.handler(
      new Request(`http://lily.test${API_PREFIX}/plants/${id}`, {
        method,
        headers: { Authorization: `Bearer ${user}` },
      })
    )
    const body: { readonly id?: string; readonly plantId?: string } =
      await response.json()
    return { status: response.status, body }
  }

  return {
    call,
    careWrites: () => Array.map(care.writes, (write) => write._tag),
  }
}

describe('a plant id sent in uppercase', () => {
  const plant = createTestPlant({ id: crypto.randomUUID(), userId: alex })
  const upper = String.toUpperCase(plant.id)

  it('reaches the plant it names', async () => {
    const { call, careWrites } = worldWith(plant)

    const read = await call(alex, 'GET', upper)
    const deleted = await call(alex, 'DELETE', upper)

    expect({
      read: [read.status, read.body.id],
      deleted: [deleted.status, deleted.body.id],
      writes: careWrites(),
    }).toEqual({
      read: [200, plant.id],
      deleted: [200, plant.id],
      writes: ['DeletePlant'],
    })
  })

  it('answers a missing plant and a hidden plant alike, with the id in lowercase', async () => {
    const { call, careWrites } = worldWith(plant)
    const missing = crypto.randomUUID()

    const answers = [
      await call(alex, 'DELETE', String.toUpperCase(missing)),
      await call(sam, 'DELETE', upper),
    ]

    expect(answers).toEqual([
      {
        status: 404,
        body: { _tag: 'PlantNotFoundError', plantId: missing },
      },
      {
        status: 404,
        body: { _tag: 'PlantNotFoundError', plantId: plant.id },
      },
    ])
    expect(careWrites()).toEqual([])
  })
})
