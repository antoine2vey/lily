import { BunFileSystem, BunPath } from '@effect/platform-bun'
import { mockCareLogs } from '@lily/api/__tests__/fixtures/care-logs'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { mockUserProfile } from '@lily/api/__tests__/mocks/auth'
import { createInMemoryCanopy } from '@lily/api/__tests__/mocks/canopy'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import {
  createInMemoryCare,
  createStubCare,
} from '@lily/api/__tests__/mocks/care'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createInMemoryGCS } from '@lily/api/__tests__/mocks/gcs.service'
import { MockLimitCheckerLive } from '@lily/api/__tests__/mocks/limit-checker'
import { MockOutboxLive } from '@lily/api/__tests__/mocks/outbox'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockRareIdentificationRepository } from '@lily/api/__tests__/mocks/rare-identification.repository'
import { createMockRoomRepository } from '@lily/api/__tests__/mocks/room.repository'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import { Api } from '@lily/api/api'
import { RecordOutcome } from '@lily/api/contexts/care'
import {
  Authentication,
  CurrentUser,
} from '@lily/api/services/auth/middleware.types'
import { CareLogsApiLive } from '@lily/api/services/care-logs/handlers'
import { PlantsApiLive } from '@lily/api/services/plants/handlers'
import { API_PREFIX, CareDay } from '@lily/shared'
import { Array, Effect, Layer, Option, pipe, Redacted } from 'effect'
import { Etag, HttpPlatform, HttpRouter } from 'effect/http'
import { HttpApi, HttpApiBuilder, type HttpApiGroup } from 'effect/http-api'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const owner = 'user-1'
const devicePath = 'file:///var/mobile/Containers/Data/tmp/photo.jpg'
const coverUrl = 'https://storage.googleapis.com/mock-bucket/plants/cover.jpg'

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

const serveGroup = <Group extends HttpApiGroup.Constraint>(
  group: Group,
  handlers: Layer.Layer<never, never, never>,
  dependencies: Layer.Layer<never, never, never>
) =>
  HttpRouter.toWebHandler(
    // Parse options set on the root Api live in its annotations, not the group's.
    HttpApiBuilder.layer(
      HttpApi.make('Api').add(group).annotateMerge(Api.annotations)
    ).pipe(
      Layer.provide(handlers),
      Layer.provide(AuthLive),
      Layer.provide(dependencies),
      Layer.provide(PlatformLive)
    ) as unknown as Layer.Layer<never>,
    { disableLogger: true }
  )

const sendJson = (method: 'POST' | 'PUT', path: string, body: unknown) =>
  new Request(`http://lily.test${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${owner}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

describe('a care log from a build that still sends photoUrl', () => {
  const plant = createTestPlant({ id: crypto.randomUUID(), userId: owner })
  const log = {
    ...pipe(Array.head(mockCareLogs), Option.getOrThrow),
    id: crypto.randomUUID(),
    plantId: plant.id,
  }
  const care = createStubCare((plantId) =>
    RecordOutcome.Recorded({
      plantId,
      careLogId: log.id,
      careType: 'watering',
      day: CareDay.make('2026-11-12'),
      dueDay: Option.none(),
    })
  )
  let web: ReturnType<typeof serveGroup>

  beforeAll(() => {
    web = serveGroup(
      Api.groups.careLogs,
      CareLogsApiLive(Api) as unknown as Layer.Layer<never, never, never>,
      Layer.mergeAll(
        createMockPlantRepository({ plants: [plant] }),
        createMockCanopyRepository([]),
        createMockDelegationRepository({}),
        createMockCareLogRepository([log]),
        createMockEventBus(),
        care.layer,
        createInMemoryGCS().layer,
        MockSqlClientLive,
        MockOutboxLive
      ) as unknown as Layer.Layer<never, never, never>
    )
  })

  beforeEach(() => {
    care.commands.length = 0
    care.amended.length = 0
  })

  afterAll(async () => {
    await web.dispose()
  })

  it.each([
    ['a file on the device', devicePath],
    ['a URL on another host', 'https://tracker.example/pixel.jpg'],
  ])('records the care without a photo for %s', async (_case, photoUrl) => {
    const response = await web.handler(
      sendJson('POST', `${API_PREFIX}/plants/${plant.id}/logs`, {
        type: 'watering',
        notes: 'Deep soak',
        photoUrl,
      })
    )

    expect({
      status: response.status,
      recorded: Array.map(care.commands, ({ notes, photoUrl }) => ({
        notes,
        photoUrl,
      })),
    }).toEqual({
      status: 201,
      recorded: [{ notes: Option.some('Deep soak'), photoUrl: Option.none() }],
    })
  })

  it('saves the edit', async () => {
    const response = await web.handler(
      sendJson('PUT', `${API_PREFIX}/plants/${plant.id}/logs/${log.id}`, {
        notes: 'Edited',
        photoUrl: devicePath,
      })
    )

    expect({
      status: response.status,
      amended: Array.map(care.amended, ({ notes }) => notes),
    }).toEqual({
      status: 200,
      amended: [Option.some(Option.some('Edited'))],
    })
  })
})

describe('a plant edit from a build that still sends imageUrl', () => {
  const plant = createTestPlant({
    id: crypto.randomUUID(),
    userId: owner,
    imageUrl: coverUrl,
  })
  const rows = [plant]
  let web: ReturnType<typeof serveGroup>

  beforeAll(() => {
    web = serveGroup(
      Api.groups.plants,
      PlantsApiLive(Api) as unknown as Layer.Layer<never, never, never>,
      Layer.mergeAll(
        createMockRoomRepository([]),
        createMockPlantRepository({ plants: rows, sharesPlantsArray: true }),
        createMockCanopyRepository(),
        createMockRareIdentificationRepository([]),
        createInMemoryGCS().layer,
        createMockEventBus(),
        createInMemoryCanopy().layer,
        MockLimitCheckerLive,
        createInMemoryCare([], { plantRows: rows }).layer
      ) as unknown as Layer.Layer<never, never, never>
    )
  })

  afterAll(async () => {
    await web.dispose()
  })

  it('saves the edit and keeps the image the plant has', async () => {
    const form = new FormData()
    form.append(
      'data',
      JSON.stringify({ name: 'Renamed', imageUrl: devicePath })
    )

    const response = await web.handler(
      new Request(`http://lily.test${API_PREFIX}/plants/${plant.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${owner}` },
        body: form,
      })
    )

    expect({
      status: response.status,
      stored: Array.map(rows, ({ name, imageUrl }) => ({ name, imageUrl })),
    }).toEqual({
      status: 200,
      stored: [{ name: 'Renamed', imageUrl: coverUrl }],
    })
    expect(await response.json()).toMatchObject({
      name: 'Renamed',
      imageUrl: coverUrl,
    })
  })
})
