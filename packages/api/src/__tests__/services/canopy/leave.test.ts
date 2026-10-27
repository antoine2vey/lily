import { mockCanopyId } from '@lily/api/__tests__/fixtures/canopies'
import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import {
  createCanopyStore,
  createTestCanopyRow,
  type MockCanopyStore,
} from '@lily/api/__tests__/mocks/canopy.repository'
import {
  canopyWorld,
  pushesOf,
  type WorldServices,
} from '@lily/api/__tests__/services/canopy/canopy-world'
import { deleteMyCanopy } from '@lily/api/services/canopy/endpoints/delete-my-canopy'
import { leaveMyCanopy } from '@lily/api/services/canopy/endpoints/leave-my-canopy'
import { leaveCanopy } from '@lily/api/services/canopy/helpers/leave-canopy'
import { CanopyNotFoundError, NotCanopyOwnerError } from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import { Effect, Exit } from 'effect'
import { describe, expect, it } from 'vitest'

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

/**
 * Alex owns Home. Sam joined before Lily, so Sam is the longest-standing
 * member after Alex even though Lily is listed first. One Canopy plant and
 * one Canopy room.
 */
const home = (): MockCanopyStore =>
  createCanopyStore({
    canopies: [createTestCanopyRow({ id: 'canopy-1', name: 'Home' })],
    members: [
      {
        canopyId: mockCanopyId,
        userId: 'lily',
        name: 'Lily',
        role: 'member',
        joinedAt: new Date('2024-06-01'),
      },
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
    ],
    plants: [
      {
        id: 'fern',
        canopyId: mockCanopyId,
        userId: null,
        remindersEnabled: true,
        diedAt: null,
      },
    ],
    rooms: [{ id: 'kitchen', canopyId: mockCanopyId, userId: null }],
  })

const soloHome = (): MockCanopyStore => {
  const store = home()
  store.members.splice(0, store.members.length, {
    canopyId: mockCanopyId,
    userId: 'alex',
    name: 'Alex',
    role: 'owner',
    joinedAt: new Date('2024-01-01'),
  })
  return store
}

const run = <A, E>(
  store: MockCanopyStore,
  actor: string,
  effect: Effect.Effect<A, E, WorldServices>,
  notifications: Notification[] = []
) =>
  Effect.runPromiseExit(
    Effect.provide(
      effect,
      canopyWorld(store, { id: actor, name: actor }, notifications).layer
    )
  )

const roleOf = (store: MockCanopyStore, userId: string) =>
  store.members.find((m) => m.userId === userId)?.role

describe('leaveCanopy', () => {
  it('hands ownership to the longest-standing member and pushes them', async () => {
    const store = home()
    const notifications: Notification[] = []

    const exit = await run(store, 'alex', leaveMyCanopy(), notifications)

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(roleOf(store, 'alex')).toBeUndefined()
    expect(roleOf(store, 'sam')).toBe('owner')
    expect(roleOf(store, 'lily')).toBe('member')
    expect(pushesOf(notifications, 'canopy_member_left')).toEqual(['sam'])
    expect(store.plants[0]?.canopyId).toBe('canopy-1')
  })

  it('keeps the owner when a member leaves, and pushes the owner', async () => {
    const store = home()
    const notifications: Notification[] = []

    await run(store, 'lily', leaveMyCanopy(), notifications)

    expect(roleOf(store, 'alex')).toBe('owner')
    expect(roleOf(store, 'lily')).toBeUndefined()
    expect(pushesOf(notifications, 'canopy_member_left')).toEqual(['alex'])
  })

  it("drops only the leaver's mutes and pending reminders on Canopy plants", async () => {
    const store = home()
    store.mutes.push(
      { userId: 'lily', plantId: 'fern' },
      { userId: 'sam', plantId: 'fern' }
    )
    const notifications = [
      pending('lily', 'fern'),
      pending('sam', 'fern'),
      pending('lily', 'personal-cactus'),
    ]

    await run(store, 'lily', leaveMyCanopy(), notifications)

    expect(store.mutes).toEqual([{ userId: 'sam', plantId: 'fern' }])
    expect(
      notifications
        .filter((n) => n.type === 'watering_reminder')
        .map((n) => n.id)
    ).toEqual(['n-sam-fern', 'n-lily-personal-cactus'])
  })

  it('dissolves the Canopy into the last member, moving every plant and room', async () => {
    const store = soloHome()
    store.mutes.push({ userId: 'alex', plantId: 'fern' })
    const notifications: Notification[] = []

    const exit = await run(store, 'alex', leaveMyCanopy(), notifications)

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(store.canopies).toEqual([])
    expect(store.members).toEqual([])
    expect(store.mutes).toEqual([])
    expect(store.plants[0]).toMatchObject({ canopyId: null, userId: 'alex' })
    expect(store.rooms[0]).toMatchObject({ canopyId: null, userId: 'alex' })
    expect(pushesOf(notifications, 'canopy_member_left')).toEqual([])
  })

  it('is a no-op for a user in no Canopy', async () => {
    const store = home()
    const exit = await run(store, 'stranger', leaveCanopy('stranger'))
    expect(exit).toEqual(
      Exit.succeed(expect.objectContaining({ _tag: 'NotMember' }))
    )
    expect(store.members).toHaveLength(3)

    const endpoint = await run(store, 'stranger', leaveMyCanopy())
    expect(failureOf(endpoint)).toEqual(new CanopyNotFoundError())
  })
})

describe('deleteMyCanopy', () => {
  it('turns every plant and room into the owner’s and deletes the Canopy', async () => {
    const store = home()

    const exit = await run(store, 'alex', deleteMyCanopy())

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(store.canopies).toEqual([])
    expect(store.members).toEqual([])
    expect(store.plants[0]).toMatchObject({ canopyId: null, userId: 'alex' })
    expect(store.rooms[0]).toMatchObject({ canopyId: null, userId: 'alex' })
  })

  it('is the owner only', async () => {
    const store = home()
    const exit = await run(store, 'lily', deleteMyCanopy())
    expect(failureOf(exit)).toEqual(new NotCanopyOwnerError())
    expect(store.canopies).toHaveLength(1)
  })
})
