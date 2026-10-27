import { mockCanopyId } from '@lily/api/__tests__/fixtures/canopies'
import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { mockUser1 } from '@lily/api/__tests__/fixtures/users'
import {
  createCanopyStore,
  createMockCanopyRepository,
  createTestCanopyRow,
  type MockCanopyStore,
} from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockRoomRepository } from '@lily/api/__tests__/mocks/room.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { createPlant } from '@lily/api/services/plants/endpoints/create-plant'
import { mutePlant } from '@lily/api/services/plants/endpoints/mute-plant'
import { sharePlantWithCanopy } from '@lily/api/services/plants/endpoints/share-plant-with-canopy'
import { unsharePlant } from '@lily/api/services/plants/endpoints/unshare-plant'
import { withPlantAuth } from '@lily/api/services/plants/helpers/with-plant-access'
import {
  CanopyNotFoundError,
  PlantInDelegationError,
  type PlantOwner,
} from '@lily/shared'
import { Effect, Exit, Layer } from 'effect'
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

const world = (options: {
  actor: string
  store?: MockCanopyStore
  checked?: PlantOwner[]
  full?: (owner: PlantOwner) => boolean
  delegated?: boolean
}) => {
  const store = options.store ?? home()
  return Layer.mergeAll(
    createMockPlantRepository({
      plants: [alexPlant, sharedByLily, sharedBySam].map((p) => ({ ...p })),
      memberships: store.members.map((m) => ({ ...m, canopyName: 'Home' })),
    }),
    createMockCanopyRepository(store),
    createMockRoomRepository([]),
    createMockDelegationRepository(
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
    ),
    createMockNotificationRepository([]),
    createMockCareScheduleRepository(),
    createMockUserRepository([
      { ...mockUser1, id: options.actor, email: `${options.actor}@x.y` },
    ]),
    createMockEventBus(),
    createMockLimitChecker({
      plantLimitReached: options.full ?? false,
      checkedOwners: options.checked,
    }),
    MockSqlClientLive,
    createMockCurrentUser({ id: options.actor })
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
      withPlantAuth('alex-fern', 'share').pipe(
        Effect.flatMap((plant) => sharePlantWithCanopy(plant, {})),
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
        const plant = yield* withPlantAuth('alex-fern', 'share')
        const result = yield* Effect.exit(sharePlantWithCanopy(plant, {}))
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
        const plant = yield* withPlantAuth('alex-fern', 'share')
        const result = yield* Effect.exit(sharePlantWithCanopy(plant, {}))
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
      withPlantAuth('alex-fern', 'share').pipe(
        Effect.flatMap((plant) => sharePlantWithCanopy(plant, {})),
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
      withPlantAuth('lily-cactus', 'unshare').pipe(
        Effect.flatMap((plant) => unsharePlant(plant, {})),
        Effect.provide(world({ actor: 'lily', store, checked }))
      )
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value.owner).toEqual({ _tag: 'User', userId: 'lily' })
    expect(checked).toEqual([{ _tag: 'User', userId: 'lily' }])
    expect(store.mutes).toEqual([{ userId: 'sam', plantId: 'sam-ivy' }])
  })

  it('lets the Canopy owner take any Canopy plant', async () => {
    const exit = await Effect.runPromiseExit(
      withPlantAuth('sam-ivy', 'unshare').pipe(
        Effect.flatMap((plant) => unsharePlant(plant, {})),
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
  it('records a mute for the caller only, once', async () => {
    const store = home()
    const exit = await Effect.runPromiseExit(
      withPlantAuth('sam-ivy', 'mute').pipe(
        Effect.flatMap((plant) =>
          Effect.andThen(mutePlant(plant), mutePlant(plant))
        ),
        Effect.provide(world({ actor: 'lily', store }))
      )
    )
    expect(Exit.isSuccess(exit)).toBe(true)
    expect(store.mutes).toEqual([{ userId: 'lily', plantId: 'sam-ivy' }])
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
