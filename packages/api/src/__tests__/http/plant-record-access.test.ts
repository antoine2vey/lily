import { BunFileSystem, BunPath } from '@effect/platform-bun'
import {
  createTestMembership,
  mockCanopyId,
} from '@lily/api/__tests__/fixtures/canopies'
import { mockCareLogs } from '@lily/api/__tests__/fixtures/care-logs'
import { createTestCarePlant } from '@lily/api/__tests__/fixtures/care-plants'
import { mockDelegation2 } from '@lily/api/__tests__/fixtures/delegations'
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
import type { PlantRole } from '@lily/api/services/plants/helpers/plant-access'
import { API_PREFIX, CareDay } from '@lily/shared'
import { Array, Effect, Layer, Option, pipe, Redacted } from 'effect'
import { Etag, HttpPlatform, HttpRouter } from 'effect/http'
import { HttpApi, HttpApiBuilder } from 'effect/http-api'
import { afterEach, describe, expect, it } from 'vitest'

const alex = 'user-alex'
const lily = 'user-lily'
const sam = 'user-sam'
const casey = 'user-casey'

const personal = createTestPlant({ id: crypto.randomUUID(), userId: alex })
const shared = createTestPlant({
  id: crypto.randomUUID(),
  userId: null,
  canopyId: mockCanopyId,
  createdByUserId: lily,
})

type Role = PlantRole['_tag']
type Author = 'own' | 'another' | 'unknown'

const callers: Record<Role, { readonly user: string; readonly plant: string }> =
  {
    Owner: { user: alex, plant: personal.id },
    Caretaker: { user: casey, plant: personal.id },
    CanopyOwner: { user: alex, plant: shared.id },
    CanopyCreator: { user: lily, plant: shared.id },
    CanopyMember: { user: sam, plant: shared.id },
  }

const mayChange: Record<Role, Record<Author, boolean>> = {
  Owner: { own: true, another: true, unknown: true },
  Caretaker: { own: true, another: false, unknown: false },
  CanopyOwner: { own: true, another: true, unknown: true },
  CanopyCreator: { own: true, another: true, unknown: true },
  CanopyMember: { own: true, another: false, unknown: false },
}

const authorOf = (user: string): Record<Author, string | null> => ({
  own: user,
  another: user === alex ? lily : alex,
  unknown: null,
})

const described: Record<Author, string> = {
  own: 'they added',
  another: 'someone else added',
  unknown: 'with no known author',
}

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

const members = [
  createTestMembership({ userId: alex, role: 'owner' }),
  createTestMembership({ userId: lily }),
  createTestMembership({ userId: sam }),
]

const disposals: Array<() => Promise<void>> = []

/** Both plants, with one care and one photo that `author` added to `plantId`. */
const worldWith = (plantId: string, author: string | null) => {
  const careLogId = crypto.randomUUID()
  const photoId = crypto.randomUUID()
  const careOf = (id: string) =>
    createTestCarePlant(id, {
      lines: [
        {
          careType: 'watering',
          schedule: Option.none(),
          history:
            id === plantId
              ? [
                  {
                    id: careLogId,
                    day: CareDay.make('2026-11-10'),
                    by: Option.fromNullishOr(author),
                  },
                ]
              : [],
        },
      ],
    })
  const care = createInMemoryCare([careOf(personal.id), careOf(shared.id)])
  const web = HttpRouter.toWebHandler(
    HttpApiBuilder.layer(TestApi).pipe(
      Layer.provide(CareLogsApiLive(Api)),
      Layer.provide(PlantsApiLive(Api)),
      Layer.provide(AuthLive),
      HttpRouter.provideRequest(
        Layer.mergeAll(
          createMockStoredRefRepository(),
          createMockRoomRepository([]),
          createMockPlantRepository({
            plants: [personal, shared],
            memberships: members,
            photos: [
              {
                id: photoId,
                url: 'https://example.com/photo.jpg',
                takenAt: new Date('2026-11-10'),
                plantId,
                uploadedByUserId: author,
              },
            ],
          }),
          createMockCanopyRepository(members),
          createMockDelegationRepository({
            delegations: [
              {
                ...mockDelegation2,
                id: 'delegation-1',
                ownerId: alex,
                caretakerId: casey,
                status: 'active',
              },
            ],
            delegationPlants: [
              { delegationId: 'delegation-1', plantId: personal.id },
            ],
          }),
          createMockCareLogRepository([
            {
              ...pipe(Array.head(mockCareLogs), Option.getOrThrow),
              id: careLogId,
              plantId,
            },
          ]),
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

  const call = async (
    user: string,
    method: 'GET' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown
  ) => {
    const response = await web.handler(
      new Request(`http://lily.test${API_PREFIX}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${user}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    )
    const text = await response.text()
    return {
      status: response.status,
      tag: text === '' ? undefined : JSON.parse(text)._tag,
    }
  }

  return {
    careLogId,
    photoId,
    call,
    careWrites: () => Array.map(care.writes, (write) => write._tag),
    photosOf: async (user: string, plant: string) => {
      const response = await web.handler(
        new Request(`http://lily.test${API_PREFIX}/plants/${plant}/photos`, {
          headers: { Authorization: `Bearer ${user}` },
        })
      )
      const { items }: { items: ReadonlyArray<{ id: string }> } =
        await response.json()
      return Array.map(items, (photo) => photo.id)
    },
  }
}

afterEach(async () => {
  await Promise.all(disposals.splice(0).map((dispose) => dispose()))
})

const refused = { status: 403, tag: 'PlantNotAuthorizedError' }

describe('changing a record of a plant over HTTP', () => {
  for (const [role, { user, plant }] of Object.entries(callers) as Array<
    [Role, (typeof callers)[Role]]
  >) {
    for (const author of ['own', 'another', 'unknown'] as const) {
      const allowed = mayChange[role][author]
      const verdict = allowed ? 'lets' : 'refuses'
      const world = () => worldWith(plant, authorOf(user)[author])

      it(`${verdict} ${role} amend a care ${described[author]}`, async () => {
        const { call, careLogId, careWrites } = world()

        const answer = await call(
          user,
          'PUT',
          `/plants/${plant}/logs/${careLogId}`,
          { notes: 'Deep soak' }
        )

        expect({ answer, writes: careWrites() }).toEqual(
          allowed
            ? {
                answer: { status: 200, tag: undefined },
                writes: ['ReplaceCare'],
              }
            : { answer: refused, writes: [] }
        )
      })

      it(`${verdict} ${role} remove a care ${described[author]}`, async () => {
        const { call, careLogId, careWrites } = world()

        const answer = await call(
          user,
          'DELETE',
          `/plants/${plant}/logs/${careLogId}`
        )

        expect({ answer, writes: careWrites() }).toEqual(
          allowed
            ? {
                answer: { status: 200, tag: undefined },
                writes: ['DeleteCare'],
              }
            : { answer: refused, writes: [] }
        )
      })

      it(`${verdict} ${role} delete a photo ${described[author]}`, async () => {
        const { call, photoId, photosOf } = world()

        const answer = await call(
          user,
          'DELETE',
          `/plants/${plant}/photos/${photoId}`
        )

        expect({ answer, photos: await photosOf(user, plant) }).toEqual(
          allowed
            ? { answer: { status: 200, tag: undefined }, photos: [] }
            : { answer: refused, photos: [photoId] }
        )
      })
    }
  }

  it('answers someone with no role on the plant as a plant that does not exist', async () => {
    const { call, careLogId, photoId, careWrites, photosOf } = worldWith(
      personal.id,
      sam
    )

    const answers = [
      await call(sam, 'PUT', `/plants/${personal.id}/logs/${careLogId}`, {
        notes: 'Deep soak',
      }),
      await call(sam, 'DELETE', `/plants/${personal.id}/logs/${careLogId}`),
      await call(sam, 'DELETE', `/plants/${personal.id}/photos/${photoId}`),
    ]

    expect(answers).toEqual(
      Array.replicate({ status: 404, tag: 'PlantNotFoundError' }, 3)
    )
    expect(careWrites()).toEqual([])
    expect(await photosOf(alex, personal.id)).toEqual([photoId])
  })

  it.each([
    ['a keeper', alex],
    ['a caretaker', casey],
  ])(
    'reads a care of another plant as not found for %s',
    async (_who, user) => {
      const { call, careLogId, careWrites } = worldWith(shared.id, lily)

      const answers = [
        await call(user, 'PUT', `/plants/${personal.id}/logs/${careLogId}`, {
          notes: 'Deep soak',
        }),
        await call(user, 'DELETE', `/plants/${personal.id}/logs/${careLogId}`),
      ]

      expect(answers).toEqual(
        Array.replicate({ status: 404, tag: 'CareLogNotFoundError' }, 2)
      )
      expect(careWrites()).toEqual([])
    }
  )

  it.each([
    ['a keeper', alex],
    ['a caretaker', casey],
  ])(
    'answers %s the same for a photo of another plant and a photo that does not exist',
    async (_who, user) => {
      const { call, photoId, photosOf } = worldWith(shared.id, lily)

      const ofAnotherPlant = await call(
        user,
        'DELETE',
        `/plants/${personal.id}/photos/${photoId}`
      )
      const missing = await call(
        user,
        'DELETE',
        `/plants/${personal.id}/photos/${crypto.randomUUID()}`
      )

      expect(ofAnotherPlant).toEqual(missing)
      expect(await photosOf(lily, shared.id)).toEqual([photoId])
    }
  )
})
