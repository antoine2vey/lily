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
import { acceptCanopyInvite } from '@lily/api/services/canopy/endpoints/accept-canopy-invite'
import { createCanopy } from '@lily/api/services/canopy/endpoints/create-canopy'
import { createCanopyInvite } from '@lily/api/services/canopy/endpoints/create-canopy-invite'
import { getMyCanopy } from '@lily/api/services/canopy/endpoints/get-my-canopy'
import { previewCanopyInvite } from '@lily/api/services/canopy/endpoints/preview-canopy-invite'
import { removeCanopyMember } from '@lily/api/services/canopy/endpoints/remove-canopy-member'
import { revokeCanopyInvite } from '@lily/api/services/canopy/endpoints/revoke-canopy-invite'
import { updateMyCanopy } from '@lily/api/services/canopy/endpoints/update-my-canopy'
import { hashInviteToken } from '@lily/api/services/canopy/helpers/invite-token'
import {
  AlreadyInCanopyError,
  CANOPY_JOIN_URL_PREFIX,
  CANOPY_MAX_MEMBERS,
  CanopyFullError,
  CanopyInviteExpiredError,
  CanopyInviteNotFoundError,
  CanopyMemberNotFoundError,
  NotCanopyOwnerError,
} from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import { Array, Effect, Exit, String } from 'effect'
import { describe, expect, it } from 'vitest'

const day = 24 * 60 * 60 * 1000

const homeWithAlex = (): MockCanopyStore =>
  createCanopyStore({
    canopies: [createTestCanopyRow({ id: 'canopy-1', name: 'Home' })],
    members: [
      {
        canopyId: 'canopy-1',
        userId: 'alex',
        name: 'Alex',
        role: 'owner',
        joinedAt: new Date('2024-01-01'),
      },
    ],
  })

const withInvite = (
  store: MockCanopyStore,
  token: string,
  expiresAt = new Date(Date.now() + day)
) => {
  store.invites.push({
    canopyId: 'canopy-1',
    tokenHash: hashInviteToken(token),
    createdByUserId: 'alex',
    expiresAt,
    revokedAt: null,
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

describe('createCanopy', () => {
  it('makes the creator the owner and copies their timezone', async () => {
    const store = createCanopyStore()
    const exit = await Effect.runPromiseExit(
      createCanopy({ name: 'Our Flat' }).pipe(
        Effect.provide(canopyWorld(store, { id: 'user-1' }).layer)
      )
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(store.canopies).toHaveLength(1)
    expect(store.canopies[0]?.name).toBe('Our Flat')
    expect(store.canopies[0]?.timezone).toBe('UTC')
    expect(store.members).toEqual([
      expect.objectContaining({ userId: 'user-1', role: 'owner' }),
    ])
  })

  it('refuses a user already in a Canopy, naming it, and creates nothing', async () => {
    const store = homeWithAlex()
    const exit = await Effect.runPromiseExit(
      createCanopy({ name: 'Second' }).pipe(
        Effect.provide(canopyWorld(store, { id: 'alex' }).layer)
      )
    )

    expect(failureOf(exit)).toEqual(
      new AlreadyInCanopyError({ canopyName: 'Home' })
    )
    expect(store.canopies).toHaveLength(1)
  })
})

describe('acceptCanopyInvite', () => {
  it('joins as a member and pushes every other member, not the joiner', async () => {
    const store = withInvite(homeWithAlex(), 'tok')
    store.members.push({
      canopyId: 'canopy-1',
      userId: 'sam',
      name: 'Sam',
      role: 'member',
      joinedAt: new Date('2024-02-01'),
    })
    const notifications: Notification[] = []

    const exit = await run(
      store,
      'lily',
      acceptCanopyInvite('tok'),
      notifications
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(store.members.find((m) => m.userId === 'lily')?.role).toBe('member')
    expect(pushesOf(notifications, 'canopy_member_joined').sort()).toEqual([
      'alex',
      'sam',
    ])
  })

  it('refuses the eleventh member and adds no row', async () => {
    const store = withInvite(homeWithAlex(), 'tok')
    Array.forEach(Array.range(2, CANOPY_MAX_MEMBERS), (n) =>
      store.members.push({
        canopyId: 'canopy-1',
        userId: `member-${n}`,
        role: 'member',
        joinedAt: new Date(`2024-03-${String.padStart(2, '0')(`${n}`)}`),
      })
    )

    const exit = await run(store, 'eleventh', acceptCanopyInvite('tok'))

    expect(failureOf(exit)).toEqual(
      new CanopyFullError({ limit: CANOPY_MAX_MEMBERS })
    )
    expect(store.members).toHaveLength(CANOPY_MAX_MEMBERS)
  })

  it('answers an expired link with InviteExpired', async () => {
    const store = withInvite(homeWithAlex(), 'tok', new Date(Date.now() - 1))

    const exit = await run(store, 'lily', acceptCanopyInvite('tok'))

    expect(failureOf(exit)).toEqual(new CanopyInviteExpiredError())
    expect(store.members).toHaveLength(1)
  })

  it('answers a revoked or unknown link with InviteNotFound', async () => {
    const store = withInvite(homeWithAlex(), 'tok')
    await run(store, 'alex', revokeCanopyInvite())

    const revoked = await run(store, 'lily', acceptCanopyInvite('tok'))
    const unknown = await run(store, 'lily', acceptCanopyInvite('nope'))

    expect(failureOf(revoked)).toEqual(new CanopyInviteNotFoundError())
    expect(failureOf(unknown)).toEqual(new CanopyInviteNotFoundError())
  })

  it('names the Canopy a member of another one is already in', async () => {
    const store = withInvite(homeWithAlex(), 'tok')
    store.canopies.push(createTestCanopyRow({ id: 'canopy-2', name: 'Cabin' }))
    store.members.push({
      canopyId: 'canopy-2',
      userId: 'sam',
      role: 'owner',
      joinedAt: new Date('2024-01-01'),
    })

    const exit = await run(store, 'sam', acceptCanopyInvite('tok'))

    expect(failureOf(exit)).toEqual(
      new AlreadyInCanopyError({ canopyName: 'Cabin' })
    )
  })

  it('accepts a link to the Canopy the user is in again, with no push', async () => {
    const store = withInvite(homeWithAlex(), 'tok')
    const notifications: Notification[] = []

    const exit = await run(
      store,
      'alex',
      acceptCanopyInvite('tok'),
      notifications
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(store.members).toHaveLength(1)
    expect(notifications).toEqual([])
  })
})

describe('createCanopyInvite', () => {
  it('returns a join URL, stores only the hash, and revokes the previous link', async () => {
    const store = homeWithAlex()

    const first = await run(store, 'alex', createCanopyInvite())
    const second = await run(store, 'alex', createCanopyInvite())
    if (!Exit.isSuccess(first) || !Exit.isSuccess(second)) {
      throw new Error('invite creation failed')
    }
    const tokenOf = (url: string) => url.slice(CANOPY_JOIN_URL_PREFIX.length)
    const firstToken = tokenOf(first.value.url)

    expect(first.value.url.startsWith(CANOPY_JOIN_URL_PREFIX)).toBe(true)
    expect(Buffer.from(firstToken, 'base64url')).toHaveLength(32)
    expect(store.invites.map((i) => i.tokenHash)).not.toContain(firstToken)
    expect(
      failureOf(await run(store, 'lily', acceptCanopyInvite(firstToken)))
    ).toEqual(new CanopyInviteNotFoundError())
    expect(
      Exit.isSuccess(
        await run(store, 'lily', acceptCanopyInvite(tokenOf(second.value.url)))
      )
    ).toBe(true)
  })
})

describe('previewCanopyInvite', () => {
  it('shows the Canopy name, inviter, and member count without a session', async () => {
    const store = withInvite(homeWithAlex(), 'tok')

    const exit = await run(store, 'nobody', previewCanopyInvite('tok', {}))

    expect(exit).toEqual(
      Exit.succeed(
        expect.objectContaining({
          canopyName: 'Home',
          inviterName: 'Alex',
          memberCount: 1,
        })
      )
    )
  })
})

describe('getMyCanopy', () => {
  it('lists members by join date and the active invite', async () => {
    const store = withInvite(homeWithAlex(), 'tok')
    store.members.unshift({
      canopyId: 'canopy-1',
      userId: 'lily',
      role: 'member',
      joinedAt: new Date('2024-05-01'),
    })

    const exit = await run(store, 'lily', getMyCanopy())
    if (!Exit.isSuccess(exit)) throw new Error('getMyCanopy failed')

    expect(exit.value.canopy?.members.map((m) => m.userId)).toEqual([
      'alex',
      'lily',
    ])
    expect(exit.value.canopy?.role).toBe('member')
    expect(exit.value.canopy?.invite).not.toBeNull()
  })

  it('answers null for a user in no Canopy', async () => {
    const exit = await run(homeWithAlex(), 'lily', getMyCanopy())
    expect(exit).toEqual(Exit.succeed({ canopy: null }))
  })
})

describe('updateMyCanopy', () => {
  const withLily = () => {
    const store = homeWithAlex()
    store.members.push({
      canopyId: 'canopy-1',
      userId: 'lily',
      role: 'member',
      joinedAt: new Date('2024-05-01'),
    })
    return store
  }

  it('lets any member rename', async () => {
    const store = withLily()
    const exit = await run(store, 'lily', updateMyCanopy({ name: 'Nest' }))
    expect(Exit.isSuccess(exit)).toBe(true)
    expect(store.canopies[0]?.name).toBe('Nest')
  })

  it('keeps the timezone and location to the owner', async () => {
    const store = withLily()
    const exit = await run(
      store,
      'lily',
      updateMyCanopy({ name: 'Nest', timezone: 'Asia/Tokyo' })
    )
    expect(failureOf(exit)).toEqual(new NotCanopyOwnerError())
    expect(store.canopies[0]).toMatchObject({
      name: 'Home',
      timezone: 'Europe/Paris',
    })

    const owner = await run(
      store,
      'alex',
      updateMyCanopy({ latitude: 48.85, longitude: 2.35 })
    )
    expect(Exit.isSuccess(owner)).toBe(true)
    expect(store.canopies[0]).toMatchObject({
      latitude: 48.85,
      longitude: 2.35,
    })
  })
})

describe('removeCanopyMember', () => {
  const withLily = () => {
    const store = homeWithAlex()
    store.members.push({
      canopyId: 'canopy-1',
      userId: 'lily',
      role: 'member',
      joinedAt: new Date('2024-05-01'),
    })
    return store
  }

  it('drops the member, their mutes, and their pending reminders, then pushes them', async () => {
    const store = withLily()
    store.plants.push({
      id: 'canopy-plant',
      canopyId: 'canopy-1',
      userId: null,
      remindersEnabled: true,
      diedAt: null,
    })
    store.mutes.push({ userId: 'lily', plantId: 'canopy-plant' })
    const notifications: Notification[] = [
      {
        id: 'n-1',
        type: 'watering_reminder',
        scheduledAt: new Date(),
        isRead: false,
        status: 'pending',
        retryCount: 0,
        userId: 'lily',
        plantId: 'canopy-plant',
        createdAt: new Date(),
      },
    ]

    const exit = await run(
      store,
      'alex',
      removeCanopyMember('lily'),
      notifications
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(store.members.map((m) => m.userId)).toEqual(['alex'])
    expect(store.mutes).toEqual([])
    expect(notifications.map((n) => n.type)).toEqual(['canopy_member_removed'])
    expect(pushesOf(notifications, 'canopy_member_removed')).toEqual(['lily'])
  })

  it('is the owner only', async () => {
    const store = withLily()
    const exit = await run(store, 'lily', removeCanopyMember('alex'))
    expect(failureOf(exit)).toEqual(new NotCanopyOwnerError())
    expect(store.members).toHaveLength(2)
  })

  it('does not remove the owner themselves or a stranger', async () => {
    const store = withLily()
    expect(
      failureOf(await run(store, 'alex', removeCanopyMember('alex')))
    ).toEqual(new CanopyMemberNotFoundError())
    expect(
      failureOf(await run(store, 'alex', removeCanopyMember('stranger')))
    ).toEqual(new CanopyMemberNotFoundError())
    expect(store.members).toHaveLength(2)
  })
})
