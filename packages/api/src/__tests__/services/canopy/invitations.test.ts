import { mockCanopyId } from '@lily/api/__tests__/fixtures/canopies'
import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { mockUser1 } from '@lily/api/__tests__/fixtures/users'
import {
  createCanopyStore,
  createTestCanopyRow,
  type MockCanopyStore,
} from '@lily/api/__tests__/mocks/canopy.repository'
import { createOutboxTimeline } from '@lily/api/__tests__/mocks/outbox-timeline'
import { createMockRateLimiterService } from '@lily/api/__tests__/mocks/rate-limiter.service'
import {
  canopyWorld,
  pushesOf,
  type WorldServices,
} from '@lily/api/__tests__/services/canopy/canopy-world'
import type { CanopyInvitationRow } from '@lily/api/repositories/canopy.repository'
import { acceptCanopyInvitation } from '@lily/api/services/canopy/endpoints/accept-canopy-invitation'
import { declineCanopyInvitation } from '@lily/api/services/canopy/endpoints/decline-canopy-invitation'
import { getCanopyInvitation } from '@lily/api/services/canopy/endpoints/get-canopy-invitation'
import { leaveMyCanopy } from '@lily/api/services/canopy/endpoints/leave-my-canopy'
import { sendCanopyInvitation } from '@lily/api/services/canopy/endpoints/send-canopy-invitation'
import { withdrawCanopyInvitation } from '@lily/api/services/canopy/endpoints/withdraw-canopy-invitation'
import { RateLimitExceededError } from '@lily/api/services/rate-limiter/errors'
import {
  AlreadyInCanopyError,
  CANOPY_MAX_MEMBERS,
  CanopyFullError,
  type CanopyId,
  CanopyInviteExpiredError,
  CanopyInviteeAlreadyMemberError,
  CanopyInviteNotFoundError,
  type User,
} from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import { Array, Effect, Exit } from 'effect'
import { describe, expect, it } from 'vitest'

const day = 24 * 60 * 60 * 1000

const userNamed = (id: string, name: string): User => ({
  ...mockUser1,
  id,
  name,
  email: `${id}@example.com`,
})

const outsiders = [userNamed('lily', 'Lily'), userNamed('noa', 'Noa')]

const home = (): MockCanopyStore =>
  createCanopyStore({
    canopies: [
      createTestCanopyRow({ id: mockCanopyId, name: 'Home' }),
      createTestCanopyRow({ id: 'canopy-2', name: 'Loft' }),
    ],
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
        joinedAt: new Date('2024-02-01'),
      },
    ],
  })

const invitation = (
  overrides: Partial<CanopyInvitationRow> = {}
): CanopyInvitationRow => ({
  id: 'invitation-1',
  canopyId: mockCanopyId,
  inviteeUserId: 'lily',
  invitedByUserId: 'sam',
  status: 'pending',
  expiresAt: new Date(Date.now() + day),
  resolvedAt: null,
  createdAt: new Date(),
  ...overrides,
})

const run = <A, E>(
  store: MockCanopyStore,
  actor: string,
  effect: Effect.Effect<A, E, WorldServices>,
  notifications: Notification[] = [],
  timeline?: ReturnType<typeof createOutboxTimeline>
) =>
  Effect.runPromiseExit(
    Effect.provide(
      effect,
      canopyWorld(
        store,
        { id: actor, name: actor },
        notifications,
        [],
        timeline,
        {},
        outsiders
      ).layer
    )
  )

const statusOf = (store: MockCanopyStore, id = 'invitation-1') =>
  store.invitations.find((i) => i.id === id)?.status

const isMember = (store: MockCanopyStore, userId: string) =>
  Array.some(store.members, (m) => m.userId === userId)

describe('sendCanopyInvitation', () => {
  it('pushes the invitee once, pointing at the invitation, and lists it on the Canopy', async () => {
    const store = home()
    const notifications: Notification[] = []

    const exit = await run(
      store,
      'sam',
      sendCanopyInvitation('lily'),
      notifications
    )

    const [sent] = store.invitations
    expect(sent).toMatchObject({
      inviteeUserId: 'lily',
      invitedByUserId: 'sam',
      status: 'pending',
    })
    expect(notifications).toEqual([
      expect.objectContaining({
        type: 'canopy_invitation',
        userId: 'lily',
        metadata: { invitationId: sent?.id },
      }),
    ])
    expect(
      Exit.map(exit, (canopy) =>
        Array.map(canopy.invitations, (i) => i.invitee.userId)
      )
    ).toEqual(Exit.succeed(['lily']))
  })

  it('sends no second push while the first invitation is open', async () => {
    const store = home()
    const notifications: Notification[] = []

    await run(store, 'sam', sendCanopyInvitation('lily'), notifications)
    const again = await run(
      store,
      'alex',
      sendCanopyInvitation('lily'),
      notifications
    )

    expect(Exit.isSuccess(again)).toBe(true)
    expect(store.invitations).toHaveLength(1)
    expect(pushesOf(notifications, 'canopy_invitation')).toEqual(['lily'])
  })

  it('stays quiet when the invitee declined in the last week', async () => {
    const store = home()
    store.invitations.push(
      invitation({ status: 'declined', resolvedAt: new Date() })
    )
    const notifications: Notification[] = []

    const exit = await run(
      store,
      'alex',
      sendCanopyInvitation('lily'),
      notifications
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(statusOf(store)).toBe('declined')
    expect(notifications).toEqual([])
  })

  it('opens the same row again once the invitation was withdrawn', async () => {
    const store = home()
    store.invitations.push(
      invitation({ status: 'withdrawn', resolvedAt: new Date() })
    )
    const notifications: Notification[] = []

    await run(store, 'alex', sendCanopyInvitation('lily'), notifications)

    expect(store.invitations).toEqual([
      expect.objectContaining({
        id: 'invitation-1',
        status: 'pending',
        invitedByUserId: 'alex',
        resolvedAt: null,
      }),
    ])
    expect(pushesOf(notifications, 'canopy_invitation')).toEqual(['lily'])
  })

  it('refuses someone already in this Canopy', async () => {
    const store = home()

    const exit = await run(store, 'alex', sendCanopyInvitation('sam'))

    expect(failureOf(exit)).toEqual(new CanopyInviteeAlreadyMemberError())
    expect(store.invitations).toEqual([])
  })

  it('refuses while the Canopy is full', async () => {
    const store = home()
    store.members.push(
      ...Array.makeBy(CANOPY_MAX_MEMBERS - 2, (i) => ({
        canopyId: mockCanopyId,
        userId: `member-${i}`,
        role: 'member' as const,
        joinedAt: new Date('2024-03-01'),
      }))
    )

    const exit = await run(store, 'alex', sendCanopyInvitation('lily'))

    expect(failureOf(exit)).toEqual(
      new CanopyFullError({ limit: CANOPY_MAX_MEMBERS })
    )
    expect(store.invitations).toEqual([])
  })

  it('refuses a sender who is rate limited before it invites anyone', async () => {
    const store = home()
    const notifications: Notification[] = []

    const exit = await run(
      store,
      'sam',
      Effect.provide(
        sendCanopyInvitation('lily'),
        createMockRateLimiterService({ shouldExceedLimit: true })
      ),
      notifications
    )

    expect(failureOf(exit)).toBeInstanceOf(RateLimitExceededError)
    expect(store.invitations).toEqual([])
    expect(notifications).toEqual([])
  })
})

describe('acceptCanopyInvitation', () => {
  it('joins, marks the invitation accepted and pushes the members', async () => {
    const store = home()
    store.invitations.push(invitation())
    const notifications: Notification[] = []
    const timeline = createOutboxTimeline()

    const exit = await run(
      store,
      'lily',
      acceptCanopyInvitation('invitation-1'),
      notifications,
      timeline
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(isMember(store, 'lily')).toBe(true)
    expect(statusOf(store)).toBe('accepted')
    expect(pushesOf(notifications, 'canopy_member_joined').sort()).toEqual([
      'alex',
      'sam',
    ])
    expect(notifications).toMatchObject([
      { type: 'canopy_member_joined', status: 'queued', metadata: {} },
      { type: 'canopy_member_joined', status: 'queued', metadata: {} },
    ])
    expect(timeline.events).toEqual([
      'begin',
      ...Array.map(
        notifications,
        (n) => `insert canopy_member_joined ${n.userId}`
      ),
      'commit',
      ...Array.map(
        notifications,
        (n) => `enqueue canopy_member_joined ${n.userId}`
      ),
    ])
  })

  it('answers a second accept with the Canopy and no new push', async () => {
    const store = home()
    store.invitations.push(invitation())
    const notifications: Notification[] = []

    await run(
      store,
      'lily',
      acceptCanopyInvitation('invitation-1'),
      notifications
    )
    const again = await run(
      store,
      'lily',
      acceptCanopyInvitation('invitation-1'),
      notifications
    )

    expect(Exit.map(again, (canopy) => canopy.id)).toEqual(
      Exit.succeed(mockCanopyId)
    )
    expect(
      Array.filter(store.members, (m) => m.userId === 'lily')
    ).toHaveLength(1)
    expect(pushesOf(notifications, 'canopy_member_joined')).toHaveLength(2)
  })

  it.each([['withdrawn' as const], ['declined' as const]])(
    'fails not found once the invitation was %s',
    async (status) => {
      const store = home()
      store.invitations.push(invitation({ status, resolvedAt: new Date() }))

      const exit = await run(
        store,
        'lily',
        acceptCanopyInvitation('invitation-1')
      )

      expect(failureOf(exit)).toEqual(new CanopyInviteNotFoundError())
      expect(isMember(store, 'lily')).toBe(false)
    }
  )

  it('fails expired after the invitation lapsed', async () => {
    const store = home()
    store.invitations.push(
      invitation({ expiresAt: new Date(Date.now() - day) })
    )

    const exit = await run(
      store,
      'lily',
      acceptCanopyInvitation('invitation-1')
    )

    expect(failureOf(exit)).toEqual(new CanopyInviteExpiredError())
    expect(isMember(store, 'lily')).toBe(false)
  })

  it('fails not found for someone who accepted, then left', async () => {
    const store = home()
    store.invitations.push(
      invitation({ status: 'accepted', resolvedAt: new Date() })
    )

    const exit = await run(
      store,
      'lily',
      acceptCanopyInvitation('invitation-1')
    )

    expect(failureOf(exit)).toEqual(new CanopyInviteNotFoundError())
    expect(isMember(store, 'lily')).toBe(false)
  })

  it('fails when the Canopy filled up after the invitation was sent', async () => {
    const store = home()
    store.invitations.push(invitation())
    store.members.push(
      ...Array.makeBy(CANOPY_MAX_MEMBERS - 2, (i) => ({
        canopyId: mockCanopyId,
        userId: `member-${i}`,
        role: 'member' as const,
        joinedAt: new Date('2024-03-01'),
      }))
    )

    const exit = await run(
      store,
      'lily',
      acceptCanopyInvitation('invitation-1')
    )

    expect(failureOf(exit)).toEqual(
      new CanopyFullError({ limit: CANOPY_MAX_MEMBERS })
    )
    expect(statusOf(store)).toBe('pending')
  })

  it('refuses an invitee who is in another Canopy', async () => {
    const store = home()
    store.invitations.push(invitation())
    store.members.push({
      canopyId: 'canopy-2' as CanopyId,
      userId: 'lily',
      role: 'owner',
      joinedAt: new Date('2024-03-01'),
    })

    const exit = await run(
      store,
      'lily',
      acceptCanopyInvitation('invitation-1')
    )

    expect(failureOf(exit)).toEqual(
      new AlreadyInCanopyError({ canopyName: 'Loft' })
    )
    expect(statusOf(store)).toBe('pending')
  })

  it('fails not found once the inviter left the Canopy', async () => {
    const store = home()
    store.invitations.push(invitation({ invitedByUserId: 'sam' }))

    await run(store, 'sam', leaveMyCanopy())
    const exit = await run(
      store,
      'lily',
      acceptCanopyInvitation('invitation-1')
    )

    expect(statusOf(store)).toBe('withdrawn')
    expect(failureOf(exit)).toEqual(new CanopyInviteNotFoundError())
  })
})

describe("another user's invitation", () => {
  const endpoints: ReadonlyArray<
    readonly [
      string,
      (id: string) => Effect.Effect<unknown, unknown, WorldServices>,
    ]
  > = [
    ['getCanopyInvitation', getCanopyInvitation],
    ['acceptCanopyInvitation', acceptCanopyInvitation],
    ['declineCanopyInvitation', declineCanopyInvitation],
  ]

  it.each(endpoints)('%s answers not found', async (_, endpoint) => {
    const store = home()
    store.invitations.push(invitation())

    const exit = await run(store, 'noa', endpoint('invitation-1'))

    expect(failureOf(exit)).toEqual(new CanopyInviteNotFoundError())
    expect(statusOf(store)).toBe('pending')
  })
})

describe('declineCanopyInvitation', () => {
  it('declines without telling anyone, and a second decline still succeeds', async () => {
    const store = home()
    store.invitations.push(invitation())
    const notifications: Notification[] = []

    await run(
      store,
      'lily',
      declineCanopyInvitation('invitation-1'),
      notifications
    )
    const again = await run(
      store,
      'lily',
      declineCanopyInvitation('invitation-1')
    )

    expect(Exit.isSuccess(again)).toBe(true)
    expect(statusOf(store)).toBe('declined')
    expect(notifications).toEqual([])
  })
})

describe('withdrawCanopyInvitation', () => {
  it('lets the owner withdraw a member’s invitation', async () => {
    const store = home()
    store.invitations.push(invitation({ invitedByUserId: 'sam' }))

    const exit = await run(
      store,
      'alex',
      withdrawCanopyInvitation('invitation-1')
    )

    expect(Exit.map(exit, (canopy) => canopy.invitations)).toEqual(
      Exit.succeed([])
    )
    expect(statusOf(store)).toBe('withdrawn')
  })

  it('refuses a member who did not send it', async () => {
    const store = home()
    store.invitations.push(invitation({ invitedByUserId: 'alex' }))

    const exit = await run(
      store,
      'sam',
      withdrawCanopyInvitation('invitation-1')
    )

    expect(failureOf(exit)).toEqual(new CanopyInviteNotFoundError())
    expect(statusOf(store)).toBe('pending')
  })
})

describe('getCanopyInvitation', () => {
  it('reports a lapsed pending invitation as expired', async () => {
    const store = home()
    store.invitations.push(
      invitation({ expiresAt: new Date(Date.now() - day) })
    )

    const exit = await run(store, 'lily', getCanopyInvitation('invitation-1'))

    expect(
      Exit.map(exit, ({ status, canopyName, inviterName }) => ({
        status,
        canopyName,
        inviterName,
      }))
    ).toEqual(
      Exit.succeed({
        status: 'expired',
        canopyName: 'Home',
        inviterName: 'Sam',
      })
    )
  })
})
