import { BunFileSystem, BunPath } from '@effect/platform-bun'
import { mockCareLogs } from '@lily/api/__tests__/fixtures/care-logs'
import { PNG_BYTES } from '@lily/api/__tests__/fixtures/images'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { mockUserProfile } from '@lily/api/__tests__/mocks/auth'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createStubCare } from '@lily/api/__tests__/mocks/care'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import {
  createInMemoryGCS,
  mockPublicUrl,
} from '@lily/api/__tests__/mocks/gcs.service'
import { MockOutboxLive } from '@lily/api/__tests__/mocks/outbox'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import { createMockStoredRefRepository } from '@lily/api/__tests__/mocks/stored-ref.repository'
import { Api } from '@lily/api/api'
import { RecordOutcome } from '@lily/api/contexts/care'
import {
  Authentication,
  CurrentUser,
} from '@lily/api/services/auth/middleware.types'
import { CareLogsApiLive } from '@lily/api/services/care-logs/handlers'
import { API_PREFIX, CareDay } from '@lily/shared'
import { Array, Effect, Layer, Option, pipe, Redacted } from 'effect'
import { Etag, HttpPlatform, HttpRouter } from 'effect/http'
import { HttpApi, HttpApiBuilder } from 'effect/http-api'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const owner = 'user-1'
const plant = createTestPlant({ id: crypto.randomUUID(), userId: owner })
const log = {
  ...pipe(Array.head(mockCareLogs), Option.getOrThrow),
  plantId: plant.id,
}
const devicePath = 'file:///var/mobile/Containers/Data/tmp/photo.jpg'

const TestApi = HttpApi.make('Api').add(Api.groups.careLogs)

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

const care = createStubCare((plantId) =>
  RecordOutcome.Recorded({
    plantId,
    careLogId: log.id,
    careType: 'watering',
    day: CareDay.make('2026-11-12'),
    dueDay: Option.none(),
  })
)
const gcs = createInMemoryGCS()

const PlatformLive = Layer.mergeAll(
  BunPath.layer,
  Etag.layer,
  HttpPlatform.layer
).pipe(Layer.provideMerge(BunFileSystem.layer))

const makeHandler = () =>
  HttpRouter.toWebHandler(
    HttpApiBuilder.layer(TestApi).pipe(
      Layer.provide(CareLogsApiLive(Api)),
      Layer.provide(AuthLive),
      HttpRouter.provideRequest(
        Layer.mergeAll(
          createMockStoredRefRepository(),
          createMockPlantRepository({ plants: [plant] }),
          createMockCanopyRepository([]),
          createMockDelegationRepository({}),
          createMockCareLogRepository([log]),
          createMockEventBus(),
          care.layer,
          gcs.layer,
          MockSqlClientLive,
          MockOutboxLive,
          BunFileSystem.layer
        )
      ),
      Layer.provide(PlatformLive)
    ),
    { disableLogger: true }
  )

describe('a care log with a photo over HTTP', () => {
  let web: ReturnType<typeof makeHandler>

  beforeAll(() => {
    web = makeHandler()
  })

  afterAll(async () => {
    await web.dispose()
  })

  it('stores the uploaded photo and records its URL, not the device path', async () => {
    const form = new FormData()
    form.append(
      'data',
      JSON.stringify({ type: 'watering', photoUrl: devicePath })
    )
    form.append(
      'image',
      new Blob([PNG_BYTES], { type: 'image/jpeg' }),
      'photo.jpg'
    )

    const response = await web.handler(
      new Request(`http://lily.test${API_PREFIX}/plants/${plant.id}/logs`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner}` },
        body: form,
      })
    )

    const stored = [...gcs.objects.plant]
    expect({
      status: response.status,
      stored: Array.map(stored, (key) =>
        key.replace(/[0-9a-f-]{36}(?=\.)/, '<uuid>')
      ),
      recorded: Array.map(care.commands, (command) => command.photoUrl),
    }).toEqual({
      status: 201,
      stored: [`plants/${plant.id}/<uuid>.png`],
      recorded: [Option.map(Array.head(stored), mockPublicUrl)],
    })
  })
})
