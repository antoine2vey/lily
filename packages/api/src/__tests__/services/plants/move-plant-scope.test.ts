import { mockCanopyId } from '@lily/api/__tests__/fixtures/canopies'
import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { createTestNotification } from '@lily/api/__tests__/fixtures/notifications'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { mockUser1 } from '@lily/api/__tests__/fixtures/users'
import { createInMemoryCanopy } from '@lily/api/__tests__/mocks/canopy'
import {
  createCanopyStore,
  createMockCanopyRepository,
  createTestCanopyRow,
  type MockCanopyStore,
} from '@lily/api/__tests__/mocks/canopy.repository'
import { createInMemoryCare } from '@lily/api/__tests__/mocks/care'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { DeliveringOutboxLive } from '@lily/api/__tests__/mocks/outbox'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockRoomRepository } from '@lily/api/__tests__/mocks/room.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { createPlant } from '@lily/api/services/plants/endpoints/create-plant'
import {
  mutePlant,
  unmutePlant,
} from '@lily/api/services/plants/endpoints/mute-plant'
import { sharePlantWithCanopy } from '@lily/api/services/plants/endpoints/share-plant-with-canopy'
import { unsharePlant } from '@lily/api/services/plants/endpoints/unshare-plant'
import {
  withPlantAuth,
  withPlantPermit,
} from '@lily/api/services/plants/helpers/with-plant-access'
import {
  CanopyId,
  CanopyNotFoundError,
  PlantInDelegationError,
  type PlantOwner,
} from '@lily/shared'
import {
  PlantNotAuthorizedError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import type { Notification } from '@lily/shared/notification'
import { Array, Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const alexPlant = createTestPlant({
  id: 'alex-fern',
  userId: 'alex',
  createdByUserId: 'alex',
  roomId: 'alex-room',
})
const sharedByLily = createTestPlant({
  id: 'lily-cactus',
  userId: null,
  canopyId: mockCanopyId,
  createdByUserId: 'lily',
})
const sharedBySam = createTestPlant({
  id: 'sam-ivy',
  userId: null,
  canopyId: mockCanopyId,
  createdByUserId: 'sam',
})

const sharedByAlex = createTestPlant({
  id: 'alex-monstera',
  userId: null,
  canopyId: mockCanopyId,
  createdByUserId: 'alex',
})
const sharerDeleted = createTestPlant({
  id: 'gone-pothos',
  userId: null,
  canopyId: mockCanopyId,
  createdByUserId: null,
})

const home = (): MockCanopyStore =>
  createCanopyStore({
    canopies: [createTestCanopyRow({ id: 'canopy-1' })],
    members: [
      {
        canopyId: mockCanopyId,
        userId: 'alex',
        role: 'owner',
        joinedAt: new Date('2024-01-01'),
      },
      {
        canopyId: mockCanopyId,
        userId: 'lily',
        role: 'member',
        joinedAt: new Date('2024-02-01'),
      },
      {
        canopyId: mockCanopyId,
        userId: 'sam',
        role: 'member',
        joinedAt: new Date('2024-03-01'),
      },
    ],
  })

type Member = MockCanopyStore['members'][number]

const withSam = (
  store: MockCanopyStore,
  edit: (sam: Member) => Member[]
): MockCanopyStore => {
  const members = Array.flatMap(store.members, (m) =>
    m.userId === 'sam' ? edit(m) : [m]
  )
  store.members.splice(0, store.members.length, ...members)
  return store
}

const world = (options: {
  actor: string
  store?: MockCanopyStore
  plants?: ReadonlyArray<ReturnType<typeof createTestPlant>>
  checked?: PlantOwner[]
  full?: (owner: PlantOwner) => boolean
  delegated?: boolean
  notifications?: Notification[]
}) => {
  const store = options.store ?? home()
  const plants = (
    options.plants ?? [
      alexPlant,
      sharedByLily,
      sharedBySam,
      sharedByAlex,
      sharerDeleted,
    ]
  ).map((p) => ({ ...p }))
  const limits = createMockLimitChecker({
    plantLimitReached: options.full ?? false,
    checkedOwners: options.checked,
  })
  const delegations = createMockDelegationRepository(
    options.delegated
      ? {
          delegations: [
            {
              id: 'd-1',
              ownerId: 'alex',
              caretakerId: 'lily',
              status: 'accepted',
              message: null,
              startDate: new Date(),
              endDate: new Date(),
              respondedAt: new Date(),
              canceledAt: null,
              completedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          delegationPlants: [{ delegationId: 'd-1', plantId: 'alex-fern' }],
        }
      : {}
  )
  const repositories = Layer.mergeAll(
    createMockPlantRepository({
      plants,
      sharesPlantsArray: true,
      memberships: store.members.map((m) => ({ ...m, canopyName: 'Home' })),
    }),
    createMockCanopyRepository(store),
    createMockRoomRepository([]),
    delegations,
    createMockNotificationRepository(options.notifications ?? []),
    createMockCareScheduleRepository(),
    createInMemoryCare([], { plantRows: plants }).layer,
    createMockUserRepository([
      { ...mockUser1, id: options.actor, email: `${options.actor}@x.y` },
    ]),
    createMockEventBus(),
    createMockMessageQueue(),
    limits,
    MockSqlClientLive,
    createMockCurrentUser({ id: options.actor })
  )
  return createInMemoryCanopy(store, [], {
    plants,
    delegations,
    limits,
  }).service.pipe(
    Layer.provideMerge(DeliveringOutboxLive),
    Layer.provideMerge(repositories)
  )
}

const ownerAfter = (plantId: string) =>
  Effect.flatMap(PlantRepository, (repo) => repo.findById(plantId)).pipe(
    Effect.map((plant) => plant?.owner)
  )

describe('sharePlantWithCanopy', () => {
  it("moves the owner's plant into the Canopy, clears its room, and checks the Canopy's limit", async () => {
    const checked: PlantOwner[] = []
    const exit = await Effect.runPromiseExit(
      withPlantPermit('alex-fern', 'share').pipe(
        Effect.flatMap((permit) => sharePlantWithCanopy(permit, {})),
        Effect.provide(world({ actor: 'alex', checked }))
      )
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value.owner).toEqual({ _tag: 'Canopy', canopyId: 'canopy-1' })
    expect(exit.value.roomId).toBeNull()
    expect(exit.value.ownership).toBe('canopy')
    expect(checked).toEqual([{ _tag: 'Canopy', canopyId: 'canopy-1' }])
  })

  it('refuses a plant in a pending, accepted, or active delegation', async () => {
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const permit = yield* withPlantPermit('alex-fern', 'share')
        const result = yield* Effect.exit(sharePlantWithCanopy(permit, {}))
        return { result, owner: yield* ownerAfter('alex-fern') }
      }).pipe(Effect.provide(world({ actor: 'alex', delegated: true })))
    )

    if (!Exit.isSuccess(exit)) throw new Error('setup failed')
    expect(failureOf(exit.value.result)).toEqual(
      new PlantInDelegationError({ plantId: 'alex-fern' })
    )
    expect(exit.value.owner).toEqual({ _tag: 'User', userId: 'alex' })
  })

  it('stops at a full free Canopy and leaves the plant personal', async () => {
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const permit = yield* withPlantPermit('alex-fern', 'share')
        const result = yield* Effect.exit(sharePlantWithCanopy(permit, {}))
        return { result, owner: yield* ownerAfter('alex-fern') }
      }).pipe(
        Effect.provide(
          world({ actor: 'alex', full: (owner) => owner._tag === 'Canopy' })
        )
      )
    )

    if (!Exit.isSuccess(exit)) throw new Error('setup failed')
    expect(failureOf(exit.value.result)).toMatchObject({
      _tag: 'LimitExceededError',
      feature: 'canopy_plants',
    })
    expect(exit.value.owner).toEqual({ _tag: 'User', userId: 'alex' })
  })

  it('needs a Canopy', async () => {
    const store = home()
    store.members.splice(0)
    const exit = await Effect.runPromiseExit(
      withPlantPermit('alex-fern', 'share').pipe(
        Effect.flatMap((permit) => sharePlantWithCanopy(permit, {})),
        Effect.provide(world({ actor: 'alex', store }))
      )
    )
    expect(failureOf(exit)).toEqual(new CanopyNotFoundError())
  })
})

describe('unsharePlant', () => {
  it("makes the creator's Canopy plant theirs, checks their own limit, and drops every mute", async () => {
    const store = home()
    store.mutes.push(
      { userId: 'alex', plantId: 'lily-cactus' },
      { userId: 'sam', plantId: 'lily-cactus' },
      { userId: 'sam', plantId: 'sam-ivy' }
    )
    const checked: PlantOwner[] = []

    const exit = await Effect.runPromiseExit(
      withPlantPermit('lily-cactus', 'unshare').pipe(
        Effect.flatMap((permit) => unsharePlant(permit, {})),
        Effect.provide(world({ actor: 'lily', store, checked }))
      )
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value.owner).toEqual({ _tag: 'User', userId: 'lily' })
    expect(checked).toEqual([{ _tag: 'User', userId: 'lily' }])
    expect(store.mutes).toEqual([{ userId: 'sam', plantId: 'sam-ivy' }])
  })

  it('drops the queued rows of members who lose the plant and keeps the new owner one', async () => {
    const queued = (userId: string) =>
      createTestNotification({
        id: `queued-${userId}`,
        userId,
        plantId: 'lily-cactus',
        type: 'watering_reminder',
        status: 'queued',
      })
    const notifications = [queued('alex'), queued('lily'), queued('sam')]

    const exit = await Effect.runPromiseExit(
      withPlantPermit('lily-cactus', 'unshare').pipe(
        Effect.flatMap((permit) => unsharePlant(permit, {})),
        Effect.provide(world({ actor: 'lily', notifications }))
      )
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(notifications.map((n) => n.id)).toEqual(['queued-lily'])
  })

  it('refuses the Canopy owner a plant its sharer still shares, and leaves it shared', async () => {
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const permit = yield* withPlantPermit('sam-ivy', 'unshare')
        const result = yield* Effect.exit(unsharePlant(permit, {}))
        return { result, owner: yield* ownerAfter('sam-ivy') }
      }).pipe(Effect.provide(world({ actor: 'alex' })))
    )

    if (!Exit.isSuccess(exit)) throw new Error('setup failed')
    expect(failureOf(exit.value.result)).toEqual(new PlantNotAuthorizedError())
    expect(exit.value.owner).toEqual({ _tag: 'Canopy', canopyId: 'canopy-1' })
  })

  it('gives the Canopy owner a plant whose sharer left the Canopy', async () => {
    const store = withSam(home(), () => [])
    const exit = await Effect.runPromiseExit(
      withPlantPermit('sam-ivy', 'unshare').pipe(
        Effect.flatMap((permit) => unsharePlant(permit, {})),
        Effect.provide(world({ actor: 'alex', store }))
      )
    )
    expect(Exit.isSuccess(exit) && exit.value.owner).toEqual({
      _tag: 'User',
      userId: 'alex',
    })
  })

  it('gives the Canopy owner a plant whose sharer moved to another Canopy', async () => {
    const store = withSam(home(), (sam) => [
      { ...sam, canopyId: CanopyId.make('canopy-2') },
    ])
    const exit = await Effect.runPromiseExit(
      withPlantPermit('sam-ivy', 'unshare').pipe(
        Effect.flatMap((permit) => unsharePlant(permit, {})),
        Effect.provide(world({ actor: 'alex', store }))
      )
    )
    expect(Exit.isSuccess(exit) && exit.value.owner).toEqual({
      _tag: 'User',
      userId: 'alex',
    })
  })

  it("gives the Canopy owner a plant whose sharer's account is gone", async () => {
    const exit = await Effect.runPromiseExit(
      withPlantPermit('gone-pothos', 'unshare').pipe(
        Effect.flatMap((permit) => unsharePlant(permit, {})),
        Effect.provide(world({ actor: 'alex' }))
      )
    )
    expect(Exit.isSuccess(exit) && exit.value.owner).toEqual({
      _tag: 'User',
      userId: 'alex',
    })
  })

  it('lets the Canopy owner make a plant they shared themselves personal', async () => {
    const exit = await Effect.runPromiseExit(
      withPlantPermit('alex-monstera', 'unshare').pipe(
        Effect.flatMap((permit) => unsharePlant(permit, {})),
        Effect.provide(world({ actor: 'alex' }))
      )
    )
    expect(Exit.isSuccess(exit) && exit.value.owner).toEqual({
      _tag: 'User',
      userId: 'alex',
    })
  })

  it('refuses a member who neither created it nor owns the Canopy', async () => {
    const exit = await Effect.runPromiseExit(
      withPlantAuth('sam-ivy', 'unshare').pipe(
        Effect.provide(world({ actor: 'lily' }))
      )
    )
    expect(failureOf(exit)).toMatchObject({ _tag: 'PlantNotAuthorizedError' })
  })
})

describe('mutePlant', () => {
  it('refuses a mute once the plant has left the Canopy, and writes none', async () => {
    const store = home()
    const stale = await Effect.runPromise(
      withPlantPermit('lily-cactus', 'mute').pipe(
        Effect.provide(world({ actor: 'sam', store }))
      )
    )
    await Effect.runPromise(
      withPlantPermit('lily-cactus', 'unshare').pipe(
        Effect.flatMap((permit) => unsharePlant(permit, {})),
        Effect.provide(world({ actor: 'lily', store }))
      )
    )
    const unshared = [{ ...sharedByLily, userId: 'lily', canopyId: null }]

    const exit = await Effect.runPromiseExit(
      mutePlant(stale).pipe(
        Effect.provide(world({ actor: 'sam', store, plants: unshared }))
      )
    )

    expect(failureOf(exit)).toMatchObject({ _tag: 'PlantNotFoundError' })
    expect(store.mutes).toEqual([])
  })

  it('records a mute for the caller only, once', async () => {
    const store = home()
    const exit = await Effect.runPromiseExit(
      withPlantPermit('sam-ivy', 'mute').pipe(
        Effect.flatMap((permit) =>
          Effect.andThen(mutePlant(permit), mutePlant(permit))
        ),
        Effect.provide(world({ actor: 'lily', store }))
      )
    )
    expect(Exit.isSuccess(exit)).toBe(true)
    expect(store.mutes).toEqual([{ userId: 'lily', plantId: 'sam-ivy' }])
  })
})

describe('unmutePlant', () => {
  it('takes back the mute of the caller alone', async () => {
    const store = home()
    store.mutes.push(
      { userId: 'alex', plantId: 'sam-ivy' },
      { userId: 'lily', plantId: 'sam-ivy' }
    )

    await Effect.runPromise(
      withPlantPermit('sam-ivy', 'mute').pipe(
        Effect.flatMap((permit) => unmutePlant(permit)),
        Effect.provide(world({ actor: 'lily', store }))
      )
    )

    expect(store.mutes).toEqual([{ userId: 'alex', plantId: 'sam-ivy' }])
  })

  it('answers not found, with the id as the caller sent it, once the plant has left the Canopy, and keeps the mute', async () => {
    const store = home()
    store.mutes.push({ userId: 'sam', plantId: 'lily-cactus' })
    const stale = await Effect.runPromise(
      withPlantPermit('lily-cactus', 'mute').pipe(
        Effect.provide(world({ actor: 'sam', store }))
      )
    )
    const unshared = [{ ...sharedByLily, userId: 'lily', canopyId: null }]

    const exit = await Effect.runPromiseExit(
      unmutePlant(stale, 'LILY-CACTUS').pipe(
        Effect.provide(world({ actor: 'sam', store, plants: unshared }))
      )
    )

    expect(failureOf(exit)).toEqual(
      new PlantNotFoundError({ plantId: 'LILY-CACTUS' })
    )
    expect(store.mutes).toEqual([{ userId: 'sam', plantId: 'lily-cactus' }])
  })
})

describe('createPlant with owner canopy', () => {
  const request = {
    name: 'Shared monstera',
    wateringFrequencyDays: 7,
    luxNeeded: 2000,
    petToxicityRating: 1,
    owner: 'canopy' as const,
  }

  it("creates the plant in the caller's Canopy with the caller as creator", async () => {
    const checked: PlantOwner[] = []
    const exit = await Effect.runPromiseExit(
      createPlant(request).pipe(
        Effect.provide(world({ actor: 'lily', checked }))
      )
    )
    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value).toMatchObject({
      ownership: 'canopy',
      canopyId: mockCanopyId,
      userId: null,
      createdByUserId: 'lily',
    })
    expect(checked).toEqual([{ _tag: 'Canopy', canopyId: 'canopy-1' }])
  })

  it('needs a Canopy', async () => {
    const store = home()
    store.members.splice(0)
    const exit = await Effect.runPromiseExit(
      createPlant(request).pipe(Effect.provide(world({ actor: 'lily', store })))
    )
    expect(failureOf(exit)).toEqual(new CanopyNotFoundError())
  })
})
