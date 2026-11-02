import { mockCanopyId } from '@lily/api/__tests__/fixtures/canopies'
import { createTestSchedule } from '@lily/api/__tests__/fixtures/care-schedules'
import {
  createCanopyStore,
  createTestCanopyRow,
  type MockCanopyPlant,
  type MockCanopyStore,
} from '@lily/api/__tests__/mocks/canopy.repository'
import {
  canopyWorld,
  type WorldServices,
} from '@lily/api/__tests__/services/canopy/canopy-world'
import { deleteMyCanopy } from '@lily/api/services/canopy/endpoints/delete-my-canopy'
import { leaveMyCanopy } from '@lily/api/services/canopy/endpoints/leave-my-canopy'
import { removeCanopyMember } from '@lily/api/services/canopy/endpoints/remove-canopy-member'
import { leaveCanopyAndDelete } from '@lily/api/services/canopy/helpers/leave-canopy'
import type { Notification } from '@lily/shared/notification'
import { Array, Effect, Exit, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

const shared = (
  id: string,
  createdByUserId: string | null,
  overrides: Partial<MockCanopyPlant> = {}
): MockCanopyPlant => ({
  id,
  canopyId: mockCanopyId,
  userId: null,
  createdByUserId,
  roomId: 'kitchen',
  remindersEnabled: true,
  diedAt: null,
  ...overrides,
})

const lilysPlants = [
  ...Array.makeBy(6, (i) => `lily-${i + 1}`),
  'lily-dead',
] as const

/** Lily, a free member, shared six live plants and a dead one. */
const household = (): MockCanopyStore =>
  createCanopyStore({
    canopies: [createTestCanopyRow({ id: 'canopy-1', name: 'Home' })],
    members: [
      {
        canopyId: mockCanopyId,
        userId: 'alex',
        name: 'Alex',
        role: 'owner',
        joinedAt: new Date('2024-01-01'),
      },
      {
        canopyId: mockCanopyId,
        userId: 'sam',
        name: 'Sam',
        role: 'member',
        joinedAt: new Date('2024-03-01'),
      },
      {
        canopyId: mockCanopyId,
        userId: 'lily',
        name: 'Lily',
        role: 'member',
        joinedAt: new Date('2024-06-01'),
      },
    ],
    plants: [
      ...Array.map(lilysPlants, (id) =>
        shared(id, 'lily', {
          diedAt: id === 'lily-dead' ? new Date('2024-09-01') : null,
        })
      ),
      shared('sam-fern', 'sam'),
      shared('alex-palm', 'alex'),
      shared('orphan', null),
      shared('ex-member-ivy', 'gone'),
    ],
    mutes: [
      { userId: 'sam', plantId: 'lily-1' },
      { userId: 'alex', plantId: 'lily-dead' },
      { userId: 'alex', plantId: 'sam-fern' },
    ],
    rooms: [{ id: 'kitchen', canopyId: mockCanopyId, userId: null }],
  })

const pending = (userId: string, plantId: string): Notification => ({
  id: `n-${userId}-${plantId}`,
  type: 'watering_reminder',
  scheduledAt: new Date(),
  isRead: false,
  status: 'pending',
  retryCount: 0,
  userId,
  plantId,
  createdAt: new Date(),
})

/** Lily's plants remind the other two; every other plant reminds one member. */
const reminders = (): Notification[] => [
  ...Array.flatMap(lilysPlants, (id) => [
    pending('alex', id),
    pending('sam', id),
  ]),
  pending('sam', 'sam-fern'),
  pending('alex', 'alex-palm'),
  pending('alex', 'orphan'),
  pending('alex', 'ex-member-ivy'),
]

const run = <A, E>(
  store: MockCanopyStore,
  actor: string,
  effect: Effect.Effect<A, E, WorldServices>,
  notifications: Notification[]
) => {
  const schedules = Array.map(store.plants, (p) =>
    createTestSchedule({
      plantId: p.id,
      nextCareAt: new Date(Date.now() + 3 * 86_400_000),
    })
  )
  return Effect.runPromiseExit(
    Effect.provide(
      effect,
      canopyWorld(store, { id: actor, name: actor }, notifications, schedules)
        .layer
    )
  )
}

const plant = (store: MockCanopyStore, id: string) =>
  store.plants.find((p) => p.id === id)

const ownersOf = (store: MockCanopyStore, ids: ReadonlyArray<string>) =>
  Array.map(ids, (id) => {
    const p = plant(store, id)
    return { id, userId: p?.userId, canopyId: p?.canopyId, roomId: p?.roomId }
  })

const personalTo = (userId: string, ids: ReadonlyArray<string>) =>
  Array.map(ids, (id) => ({ id, userId, canopyId: null, roomId: null }))

const inCanopy = (ids: ReadonlyArray<string>) =>
  Array.map(ids, (id) => ({
    id,
    userId: null,
    canopyId: mockCanopyId,
    roomId: 'kitchen',
  }))

/** Who holds a pending reminder for each of these plants. */
const reminderHolders = (
  notifications: ReadonlyArray<Notification>,
  ids: ReadonlyArray<string>
) =>
  pipe(
    notifications,
    Array.filter(
      (n) =>
        n.type === 'watering_reminder' &&
        n.status === 'pending' &&
        n.plantId !== undefined &&
        Array.contains(ids, n.plantId)
    ),
    Array.map((n) => `${n.userId}:${n.plantId}`),
    Array.sort((a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0))
  )

const liveOf = (ids: ReadonlyArray<string>) =>
  Array.filter(ids, (id) => id !== 'lily-dead')

const others = ['sam-fern', 'alex-palm', 'orphan', 'ex-member-ivy'] as const

describe.each([
  ['leaves', 'lily', () => leaveMyCanopy()],
  ['is removed by the owner', 'alex', () => removeCanopyMember('lily')],
] as const)('when a member %s', (_, actor, endpoint) => {
  it('gives every plant they shared, dead ones too, back to them with no room', async () => {
    const store = household()
    const notifications = reminders()

    const exit = await run(store, actor, endpoint(), notifications)

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(ownersOf(store, lilysPlants)).toEqual(
      personalTo('lily', lilysPlants)
    )
    expect(ownersOf(store, others)).toEqual(inCanopy(others))
  })

  it('drops every mute on the returned plants and keeps the rest', async () => {
    const store = household()

    await run(store, actor, endpoint(), reminders())

    expect(store.mutes).toEqual([{ userId: 'alex', plantId: 'sam-fern' }])
  })

  it('rebuilds reminders for the sharer alone, none for the dead plant', async () => {
    const store = household()
    const notifications = reminders()

    await run(store, actor, endpoint(), notifications)

    expect(reminderHolders(notifications, lilysPlants)).toEqual(
      Array.map(liveOf(lilysPlants), (id) => `lily:${id}`).sort()
    )
    expect(reminderHolders(notifications, others)).toEqual([
      'alex:alex-palm',
      'alex:ex-member-ivy',
      'alex:orphan',
      'sam:sam-fern',
    ])
  })
})

describe('when the owner leaves while others stay', () => {
  it('gives their own plants back, passes ownership, and leaves the rest shared', async () => {
    const store = household()
    const notifications = reminders()

    const exit = await run(store, 'alex', leaveMyCanopy(), notifications)

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(store.members.find((m) => m.userId === 'sam')?.role).toBe('owner')
    expect(ownersOf(store, ['alex-palm'])).toEqual(
      personalTo('alex', ['alex-palm'])
    )
    const stay = ['sam-fern', 'orphan', 'ex-member-ivy', ...lilysPlants]
    expect(ownersOf(store, stay)).toEqual(inCanopy(stay))
    expect(reminderHolders(notifications, ['alex-palm'])).toEqual([
      'alex:alex-palm',
    ])
    expect(store.mutes).toEqual([{ userId: 'sam', plantId: 'lily-1' }])
  })
})

describe('when the owner deletes the Canopy', () => {
  it("gives each member's plants back to them and the rest, with the rooms, to the owner", async () => {
    const store = household()
    const notifications = reminders()

    const exit = await run(store, 'alex', deleteMyCanopy(), notifications)

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(store.canopies).toEqual([])
    expect(ownersOf(store, lilysPlants)).toEqual(
      personalTo('lily', lilysPlants)
    )
    expect(ownersOf(store, ['sam-fern'])).toEqual(
      personalTo('sam', ['sam-fern'])
    )
    expect(
      Array.map(['alex-palm', 'orphan', 'ex-member-ivy'], (id) => ({
        id,
        userId: plant(store, id)?.userId,
        canopyId: plant(store, id)?.canopyId,
      }))
    ).toEqual(
      Array.map(['alex-palm', 'orphan', 'ex-member-ivy'], (id) => ({
        id,
        userId: 'alex',
        canopyId: null,
      }))
    )
    expect(store.rooms[0]).toMatchObject({ canopyId: null, userId: 'alex' })
    expect(store.mutes).toEqual([])
    expect(reminderHolders(notifications, lilysPlants)).toEqual(
      Array.map(liveOf(lilysPlants), (id) => `lily:${id}`).sort()
    )
    expect(
      reminderHolders(notifications, [
        'sam-fern',
        'alex-palm',
        'orphan',
        'ex-member-ivy',
      ])
    ).toEqual([
      'alex:alex-palm',
      'alex:ex-member-ivy',
      'alex:orphan',
      'sam:sam-fern',
    ])
  })
})

describe('when a member deletes their account', () => {
  it('leaves the plants they shared in the Canopy', async () => {
    const store = household()

    const exit = await run(
      store,
      'lily',
      leaveCanopyAndDelete('lily')(Effect.void),
      reminders()
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(store.members.map((m) => m.userId)).toEqual(['alex', 'sam'])
    expect(ownersOf(store, lilysPlants)).toEqual(inCanopy(lilysPlants))
  })
})
