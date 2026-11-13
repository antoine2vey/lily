import {
  createTestMembership,
  mockCanopyId,
} from '@lily/api/__tests__/fixtures/canopies'
import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { createTestNotification } from '@lily/api/__tests__/fixtures/notifications'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { createTestRoom } from '@lily/api/__tests__/fixtures/rooms'
import {
  createInMemoryCanopy,
  type MockCanopySurroundings,
} from '@lily/api/__tests__/mocks/canopy'
import {
  createCanopyStore,
  createTestCanopyRow,
} from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { MockOutboxLive } from '@lily/api/__tests__/mocks/outbox'
import { createOutboxTimeline } from '@lily/api/__tests__/mocks/outbox-timeline'
import { assumingTransaction } from '@lily/api/__tests__/mocks/transaction'
import {
  Canopy,
  type CanopyChanges,
  hashInviteToken,
  JoinVia,
} from '@lily/api/contexts/canopy'
import { CanopyWrite, RoomMove } from '@lily/api/contexts/canopy/domain/decide'
import {
  CanopyStore,
  Find,
  InvitationScope,
  lockPlan,
  PlantScope,
  PlantsNotMovedDefect,
  RoomScope,
  RowsNotWrittenDefect,
} from '@lily/api/contexts/canopy/store'
import { Actor, mintPermit, systemPermit } from '@lily/api/kernel/permit'
import type { Transaction } from '@lily/api/kernel/transact'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import {
  AlreadyInCanopyError,
  CANOPY_INVITE_TTL_DAYS,
  CANOPY_MAX_MEMBERS,
  CanopyFullError,
  CanopyId,
  CanopyInviteExpiredError,
  CanopyInviteeAlreadyMemberError,
  CanopyInviteNotFoundError,
  CanopyMemberNotFoundError,
  CanopyNotFoundError,
  NotCanopyOwnerError,
  PlantInDelegationError,
  type PlantOwner,
  RoomNotFoundError,
  UnauthorizedError,
  UserNotFoundError,
} from '@lily/shared'
import {
  PlantNotAuthorizedError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import { Array, Cause, DateTime, Effect, Exit, Layer, Option } from 'effect'
import { SqlError, UnknownError } from 'effect/sql/SqlError'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const NOW = new Date('2026-11-13T09:00:00Z')
const otherCanopyId = CanopyId.make('canopy-2')

const sam = {
  id: 'sam',
  name: 'Sam',
  timezone: 'Asia/Tokyo',
  latitude: 35.68,
  longitude: 139.69,
}

const home = (around: MockCanopySurroundings = {}) =>
  createInMemoryCanopy(
    createCanopyStore({
      canopies: [
        createTestCanopyRow(),
        createTestCanopyRow({ id: otherCanopyId, name: 'Cabin' }),
      ],
      members: [
        createTestMembership({ userId: 'alex', role: 'owner' }),
        createTestMembership({ userId: 'lily', role: 'member' }),
        createTestMembership({
          userId: 'noor',
          role: 'owner',
          canopyId: otherCanopyId,
        }),
      ],
      invites: [
        {
          canopyId: mockCanopyId,
          tokenHash: 'old-hash',
          createdByUserId: 'alex',
          expiresAt: new Date('2026-11-15T00:00:00Z'),
          revokedAt: null,
        },
      ],
    }),
    [sam],
    around
  )

type World = ReturnType<typeof home>
type Service = Canopy['Service']

const run = <A, E>(
  world: World,
  command: (canopy: Service) => Effect.Effect<A, E, Transaction>
) =>
  Effect.runPromise(
    Effect.flatMap(Canopy, command).pipe(
      assumingTransaction,
      Effect.provide(world.layer)
    )
  )

const refused = <A, E>(
  world: World,
  command: (canopy: Service) => Effect.Effect<A, E, Transaction>
) =>
  Effect.runPromiseExit(
    Effect.flatMap(Canopy, command).pipe(
      assumingTransaction,
      Effect.provide(world.layer)
    )
  ).then(failureOf)

const changes = (given: Partial<CanopyChanges>): CanopyChanges => ({
  name: Option.none(),
  timezone: Option.none(),
  latitude: Option.none(),
  longitude: Option.none(),
  ...given,
})

const liveLinksOf = (world: World, canopyId: string) =>
  Array.filter(
    world.store.invites,
    (link) => link.canopyId === canopyId && link.revokedAt === null
  )

describe('Canopy', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('create', () => {
    it('answers AlreadyInCanopyError with the name of the canopy the creator is in, and creates nothing', async () => {
      const world = home()

      const error = await refused(world, (canopy) =>
        canopy.create({ by: 'lily', name: 'Second home' })
      )

      expect(error).toEqual(new AlreadyInCanopyError({ canopyName: 'Home' }))
      expect(Array.map(world.store.canopies, (c) => c.name)).toEqual([
        'Home',
        'Cabin',
      ])
    })

    it('makes the creator the owner of a canopy in their timezone and at their location', async () => {
      const world = home()

      const { canopyId } = await run(world, (canopy) =>
        canopy.create({ by: 'sam', name: 'Studio' })
      )

      expect(
        Array.filter(world.store.canopies, (c) => c.id === canopyId)
      ).toMatchObject([
        {
          name: 'Studio',
          timezone: 'Asia/Tokyo',
          latitude: 35.68,
          longitude: 139.69,
        },
      ])
      expect(
        Array.filter(world.store.members, (m) => m.userId === 'sam')
      ).toEqual([{ canopyId, userId: 'sam', role: 'owner', joinedAt: NOW }])
      expect(world.events).toEqual([])
    })

    it('answers the UnauthorizedError of a request with no account behind it to a creator whose account is gone, and creates nothing', async () => {
      const world = home()

      const error = await refused(world, (canopy) =>
        canopy.create({ by: 'ghost', name: 'Nowhere' })
      )

      expect(error).toEqual(
        new UnauthorizedError({ message: 'Authentication failed' })
      )
      expect(Array.map(world.store.canopies, (c) => c.name)).toEqual([
        'Home',
        'Cabin',
      ])
      expect(world.store.members).toHaveLength(3)
    })
  })

  describe('update', () => {
    it('answers CanopyNotFoundError to someone with no canopy', async () => {
      const world = home()

      const error = await refused(world, (canopy) =>
        canopy.update({
          by: 'sam',
          changes: changes({ name: Option.some('Nest') }),
        })
      )

      expect(error).toEqual(new CanopyNotFoundError())
    })

    it('answers NotCanopyOwnerError to a member who moves the canopy, and changes nothing', async () => {
      const world = home()

      const error = await refused(world, (canopy) =>
        canopy.update({
          by: 'lily',
          changes: changes({
            name: Option.some('Nest'),
            timezone: Option.some('Asia/Tokyo'),
          }),
        })
      )

      expect(error).toEqual(new NotCanopyOwnerError())
      expect(world.store.canopies[0]).toMatchObject({
        name: 'Home',
        timezone: 'Europe/Paris',
      })
      expect(world.events).toEqual([])
    })

    it('renames only the canopy of the member who asks, and tells nobody', async () => {
      const world = home()

      const outcome = await run(world, (canopy) =>
        canopy.update({
          by: 'lily',
          changes: changes({ name: Option.some('Nest') }),
        })
      )

      expect(outcome).toEqual({ canopyId: mockCanopyId })
      expect(Array.map(world.store.canopies, (c) => c.name)).toEqual([
        'Nest',
        'Cabin',
      ])
      expect(world.events).toEqual([])
    })

    it('says the timezone changed when the owner moves the canopy', async () => {
      const world = home()

      await run(world, (canopy) =>
        canopy.update({
          by: 'alex',
          changes: changes({
            timezone: Option.some('Asia/Tokyo'),
            latitude: Option.some(35.68),
            longitude: Option.some(139.69),
          }),
        })
      )

      expect(world.store.canopies[0]).toMatchObject({
        name: 'Home',
        timezone: 'Asia/Tokyo',
        latitude: 35.68,
        longitude: 139.69,
      })
      expect(world.events).toEqual([
        { _tag: 'CanopyTimezoneChanged', canopyId: mockCanopyId },
      ])
    })
  })

  describe('links', () => {
    it('answers CanopyNotFoundError to someone with no canopy, and keeps the live link', async () => {
      const world = home()

      const errors = [
        await refused(world, (canopy) => canopy.createLink({ by: 'sam' })),
        await refused(world, (canopy) => canopy.revokeLink({ by: 'sam' })),
      ]

      expect(errors).toEqual([
        new CanopyNotFoundError(),
        new CanopyNotFoundError(),
      ])
      expect(
        Array.map(liveLinksOf(world, mockCanopyId), (l) => l.tokenHash)
      ).toEqual(['old-hash'])
    })

    it('hands a member a token that opens the one live link, good for the invite lifetime', async () => {
      const world = home()

      const link = await run(world, (canopy) =>
        canopy.createLink({ by: 'lily' })
      )

      expect(liveLinksOf(world, mockCanopyId)).toEqual([
        {
          canopyId: mockCanopyId,
          tokenHash: hashInviteToken(link.token),
          createdByUserId: 'lily',
          expiresAt: DateTime.toDateUtc(link.expiresAt),
          revokedAt: null,
        },
      ])
      expect(link.expiresAt).toEqual(
        DateTime.add(DateTime.makeUnsafe(NOW), { days: CANOPY_INVITE_TTL_DAYS })
      )
    })

    it('lets a member revoke the live link someone else made', async () => {
      const world = home()

      await run(world, (canopy) => canopy.revokeLink({ by: 'lily' }))

      expect(world.store.invites).toMatchObject([
        { tokenHash: 'old-hash', revokedAt: NOW },
      ])
    })
  })

  describe('join', () => {
    const inTwoDays = new Date('2026-11-15T00:00:00Z')

    const linkTo = (
      world: World,
      canopyId: string,
      token: string,
      expiresAt = inTwoDays
    ) => {
      world.store.invites.push({
        canopyId,
        tokenHash: hashInviteToken(token),
        createdByUserId: null,
        expiresAt,
        revokedAt: null,
      })
      return world
    }

    const byLink = (joiner: string, token: string) => (canopy: Service) =>
      canopy.join({ joiner, via: JoinVia.Link({ token }) })

    const membersOf = (world: World, canopyId: string) =>
      Array.filter(world.store.members, (m) => m.canopyId === canopyId)

    it('seats the joiner and queues, for each member of before, a notice in their language that names the joiner', async () => {
      const world = linkTo(home(), otherCanopyId, 'cabin-token')
      world.store.members.push(
        createTestMembership({
          userId: 'alex-fr',
          canopyId: otherCanopyId,
          language: 'fr',
        })
      )

      const outcome = await run(world, byLink('sam', 'cabin-token'))

      expect(outcome).toEqual({ canopyId: otherCanopyId })
      expect(
        Array.filter(world.store.members, (m) => m.userId === 'sam')
      ).toEqual([
        {
          canopyId: otherCanopyId,
          userId: 'sam',
          role: 'member',
          joinedAt: NOW,
        },
      ])
      expect(world.events).toEqual([
        { _tag: 'MemberJoined', canopyId: otherCanopyId, userId: 'sam' },
      ])
      expect(world.notifications).toMatchObject([
        {
          userId: 'noor',
          type: 'canopy_member_joined',
          status: 'queued',
          body: 'Sam joined Cabin',
        },
        {
          userId: 'alex-fr',
          type: 'canopy_member_joined',
          status: 'queued',
          body: 'Sam a rejoint Cabin',
        },
      ])
    })

    it('answers CanopyInviteNotFoundError to a token no link was made from', async () => {
      const world = home()

      const error = await refused(world, byLink('sam', 'never-issued'))

      expect(error).toEqual(new CanopyInviteNotFoundError())
    })

    it('answers CanopyInviteExpiredError to a link past its date, and seats nobody', async () => {
      const world = linkTo(
        home(),
        otherCanopyId,
        'cabin-token',
        new Date('2026-11-12T00:00:00Z')
      )

      const error = await refused(world, byLink('sam', 'cabin-token'))

      expect(error).toEqual(new CanopyInviteExpiredError())
      expect(membersOf(world, otherCanopyId)).toHaveLength(1)
    })

    it('answers AlreadyInCanopyError, naming their canopy, to a member of another one', async () => {
      const world = linkTo(home(), otherCanopyId, 'cabin-token')

      const error = await refused(world, byLink('lily', 'cabin-token'))

      expect(error).toEqual(new AlreadyInCanopyError({ canopyName: 'Home' }))
      expect(world.notifications).toEqual([])
    })

    it('answers CanopyFullError with the limit once every seat is taken', async () => {
      const world = linkTo(home(), otherCanopyId, 'cabin-token')
      world.store.members.push(
        ...Array.makeBy(CANOPY_MAX_MEMBERS - 1, (n) =>
          createTestMembership({
            userId: `guest-${n}`,
            canopyId: otherCanopyId,
          })
        )
      )

      const error = await refused(world, byLink('sam', 'cabin-token'))

      expect(error).toEqual(new CanopyFullError({ limit: CANOPY_MAX_MEMBERS }))
      expect(membersOf(world, otherCanopyId)).toHaveLength(CANOPY_MAX_MEMBERS)
    })

    it('rolls the join back and sends nothing when a notice cannot be recorded', async () => {
      const world = linkTo(home(), otherCanopyId, 'cabin-token')
      const timeline = createOutboxTimeline()
      const refusingNotifications = Layer.effect(
        NotificationRepository,
        Effect.map(NotificationRepository, (repo) => ({
          ...repo,
          create: () =>
            Effect.fail(
              new SqlError({
                reason: new UnknownError({
                  cause: new Error('notification refused'),
                  message: 'notification refused',
                }),
              })
            ),
        }))
      ).pipe(Layer.provide(createMockNotificationRepository([])))

      const exit = await Effect.runPromiseExit(
        Effect.flatMap(Canopy, byLink('sam', 'cabin-token')).pipe(
          Effect.provide(
            world.service.pipe(
              Layer.provide(
                Layer.mergeAll(
                  MockOutboxLive,
                  timeline.sql,
                  timeline.queue,
                  refusingNotifications
                )
              )
            )
          )
        )
      )

      expect(Exit.hasDies(exit)).toBe(true)
      expect(timeline.events).toEqual(['begin', 'rollback'])
    })

    it('sends a notice only once the join that recorded it has committed', async () => {
      const world = linkTo(home(), otherCanopyId, 'cabin-token')
      const timeline = createOutboxTimeline()

      await Effect.runPromise(
        Effect.flatMap(Canopy, byLink('sam', 'cabin-token')).pipe(
          Effect.provide(
            world.service.pipe(
              Layer.provide(
                Layer.mergeAll(
                  MockOutboxLive,
                  timeline.sql,
                  timeline.queue,
                  createMockNotificationRepository(
                    [],
                    timeline.notificationOptions
                  )
                )
              )
            )
          )
        )
      )

      expect(timeline.events).toEqual([
        'begin',
        'insert canopy_member_joined noor',
        'commit',
        'enqueue canopy_member_joined noor',
      ])
    })

    it('locks the joiner, then the canopy the link or the invitation leads to, then their account, then the invitation', async () => {
      const world = linkTo(home(), otherCanopyId, 'cabin-token')
      const viaInvitation = JoinVia.Invitation({ invitationId: 'invitation-1' })

      await Effect.runPromiseExit(
        Effect.flatMap(Canopy, (canopy) =>
          Effect.all(
            [
              canopy.join({ joiner: 'sam', via: viaInvitation }),
              byLink('sam', 'cabin-token')(canopy),
            ],
            { mode: 'result' }
          )
        ).pipe(Effect.provide(world.layer))
      )

      expect(world.plans).toEqual([
        {
          actor: Option.some('sam'),
          canopy: Find.ByInvitation({ invitationId: 'invitation-1' }),
          absenceOf: Option.none(),
          accounts: ['sam'],
          invitations: InvitationScope.One({ invitationId: 'invitation-1' }),
          rooms: RoomScope.None(),
          plants: PlantScope.None(),
        },
        {
          actor: Option.some('sam'),
          canopy: Find.ByLink({ tokenHash: hashInviteToken('cabin-token') }),
          absenceOf: Option.none(),
          accounts: ['sam'],
          invitations: InvitationScope.None(),
          rooms: RoomScope.None(),
          plants: PlantScope.None(),
        },
      ])
    })
  })

  describe('invitations', () => {
    const inAWeek = new Date(
      NOW.getTime() + CANOPY_INVITE_TTL_DAYS * 86_400_000
    )

    const sentBy = (
      world: World,
      invitedByUserId: string,
      overrides: Partial<World['store']['invitations'][number]> = {}
    ) => {
      world.store.invitations.push({
        id: 'invitation-1',
        canopyId: mockCanopyId,
        inviteeUserId: 'sam',
        invitedByUserId,
        status: 'pending',
        expiresAt: inAWeek,
        resolvedAt: null,
        createdAt: new Date('2026-11-01T00:00:00Z'),
        ...overrides,
      })
      return world
    }

    const invite = (by: string, invitee: string) => (canopy: Service) =>
      canopy.invite({ by, invitee })

    const withdraw = (by: string) => (canopy: Service) =>
      canopy.withdrawInvitation({ by, invitationId: 'invitation-1' })

    const decline = (by: string) => (canopy: Service) =>
      canopy.declineInvitation({ by, invitationId: 'invitation-1' })

    const statuses = (world: World) =>
      Array.map(world.store.invitations, (invitation) => invitation.status)

    it('opens an invitation good for the invite lifetime and queues the invitee a notice, in their language, that names the inviter and points at it', async () => {
      const world = createInMemoryCanopy(
        createCanopyStore({
          canopies: [createTestCanopyRow()],
          members: [
            createTestMembership({ userId: 'alex', role: 'owner' }),
            createTestMembership({
              userId: 'lily',
              role: 'member',
              name: 'Lily',
            }),
          ],
        }),
        [{ ...sam, language: 'fr' }]
      )

      const outcome = await run(world, invite('lily', 'sam'))

      const [opened] = world.store.invitations
      expect(outcome).toEqual({ canopyId: mockCanopyId })
      expect(world.store.invitations).toEqual([
        {
          id: expect.any(String),
          canopyId: mockCanopyId,
          inviteeUserId: 'sam',
          invitedByUserId: 'lily',
          status: 'pending',
          expiresAt: inAWeek,
          resolvedAt: null,
          createdAt: NOW,
        },
      ])
      expect(world.notifications).toMatchObject([
        {
          userId: 'sam',
          type: 'canopy_invitation',
          status: 'queued',
          body: "Lily t'invite à rejoindre Home",
          metadata: { invitationId: opened?.id },
        },
      ])
      expect(world.events).toEqual([])
    })

    it('opens the row the invitee already has again, in the name of the new inviter, and sends nothing while it is open', async () => {
      const world = sentBy(home(), 'lily', {
        status: 'withdrawn',
        resolvedAt: new Date('2026-11-12T00:00:00Z'),
      })

      await run(world, invite('alex', 'sam'))
      await run(world, invite('lily', 'sam'))

      expect(world.store.invitations).toMatchObject([
        {
          id: 'invitation-1',
          invitedByUserId: 'alex',
          status: 'pending',
          expiresAt: inAWeek,
          resolvedAt: null,
          createdAt: NOW,
        },
      ])
      expect(
        Array.map(world.notifications, (notice) => [
          notice.userId,
          notice.type,
          notice.metadata,
        ])
      ).toEqual([
        ['sam', 'canopy_invitation', { invitationId: 'invitation-1' }],
      ])
    })

    it.each<
      readonly [
        string,
        (canopy: Service) => Effect.Effect<unknown, unknown>,
        unknown,
      ]
    >([
      [
        'CanopyNotFoundError to an invitation from someone with no canopy',
        invite('sam', 'lily'),
        new CanopyNotFoundError(),
      ],
      [
        'UserNotFoundError, naming the invitee, for an account that does not exist',
        invite('alex', 'nobody'),
        new UserNotFoundError({ userId: 'nobody' }),
      ],
      [
        'UserNotFoundError for an account that is suspended',
        invite('alex', 'suspended'),
        new UserNotFoundError({ userId: 'suspended' }),
      ],
      [
        'UserNotFoundError for an account that is being deleted',
        invite('alex', 'leaving'),
        new UserNotFoundError({ userId: 'leaving' }),
      ],
      [
        'CanopyInviteeAlreadyMemberError for a member of the canopy',
        invite('alex', 'lily'),
        new CanopyInviteeAlreadyMemberError(),
      ],
      [
        'CanopyNotFoundError to a withdrawal by someone with no canopy',
        withdraw('sam'),
        new CanopyNotFoundError(),
      ],
      [
        'CanopyInviteNotFoundError to a withdrawal by a member of another canopy',
        withdraw('noor'),
        new CanopyInviteNotFoundError(),
      ],
      [
        'CanopyInviteNotFoundError to a withdrawal by a member who did not send it',
        withdraw('lily'),
        new CanopyInviteNotFoundError(),
      ],
      [
        'CanopyInviteNotFoundError to a decline by anyone but the invitee',
        decline('lily'),
        new CanopyInviteNotFoundError(),
      ],
    ])(
      'answers %s, and changes no invitation',
      async (_name, command, error) => {
        const outsider = { ...sam, timezone: null }
        const world = sentBy(
          createInMemoryCanopy(
            createCanopyStore({
              canopies: [
                createTestCanopyRow(),
                createTestCanopyRow({ id: otherCanopyId, name: 'Cabin' }),
              ],
              members: [
                createTestMembership({ userId: 'alex', role: 'owner' }),
                createTestMembership({ userId: 'lily', role: 'member' }),
                createTestMembership({
                  userId: 'noor',
                  role: 'owner',
                  canopyId: otherCanopyId,
                }),
              ],
            }),
            [
              sam,
              { ...outsider, id: 'suspended', status: 'suspended' },
              { ...outsider, id: 'leaving', deletedAt: NOW },
            ]
          ),
          'alex'
        )
        const before = structuredClone(world.store.invitations)

        expect(await refused(world, command)).toEqual(error)
        expect(world.store.invitations).toEqual(before)
        expect(world.notifications).toEqual([])
      }
    )

    it('answers CanopyFullError with the limit to an invitation into a full canopy', async () => {
      const world = home()
      world.store.members.push(
        ...Array.makeBy(CANOPY_MAX_MEMBERS - 2, (n) =>
          createTestMembership({ userId: `member-${n}`, role: 'member' })
        )
      )

      expect(await refused(world, invite('alex', 'sam'))).toEqual(
        new CanopyFullError({ limit: CANOPY_MAX_MEMBERS })
      )
      expect(world.store.invitations).toEqual([])
    })

    it('lets the owner withdraw what a member sent, and a second withdrawal change nothing', async () => {
      const world = sentBy(home(), 'lily')

      const outcomes = [
        await run(world, withdraw('alex')),
        await run(world, withdraw('alex')),
      ]

      expect(outcomes).toEqual(Array.replicate({ canopyId: mockCanopyId }, 2))
      expect(world.store.invitations).toMatchObject([
        { id: 'invitation-1', status: 'withdrawn', resolvedAt: NOW },
      ])
      expect(world.writes).toHaveLength(1)
    })

    it('lets the invitee decline, tells nobody, and a second decline change nothing', async () => {
      const world = sentBy(home(), 'lily')

      await run(world, decline('sam'))
      await run(world, decline('sam'))

      expect(world.store.invitations).toMatchObject([
        { id: 'invitation-1', status: 'declined', resolvedAt: NOW },
      ])
      expect(world.writes).toHaveLength(1)
      expect(world.notifications).toEqual([])
      expect(world.events).toEqual([])
    })

    it('answers CanopyInviteNotFoundError to a decline after a withdrawal and to a withdrawal after a decline', async () => {
      const taken = sentBy(home(), 'lily')
      const turnedDown = sentBy(home(), 'lily')
      await run(taken, withdraw('lily'))
      await run(turnedDown, decline('sam'))

      const errors = [
        await refused(taken, decline('sam')),
        await refused(turnedDown, withdraw('lily')),
      ]

      expect(errors).toEqual(
        Array.replicate(new CanopyInviteNotFoundError(), 2)
      )
      expect([statuses(taken), statuses(turnedDown)]).toEqual([
        ['withdrawn'],
        ['declined'],
      ])
    })

    it('rolls the invitation back and sends nothing when its notice cannot be recorded', async () => {
      const world = home()
      const timeline = createOutboxTimeline()
      const refusingNotifications = Layer.effect(
        NotificationRepository,
        Effect.map(NotificationRepository, (repo) => ({
          ...repo,
          create: () =>
            Effect.fail(
              new SqlError({
                reason: new UnknownError({
                  cause: new Error('notification refused'),
                  message: 'notification refused',
                }),
              })
            ),
        }))
      ).pipe(Layer.provide(createMockNotificationRepository([])))

      const exit = await Effect.runPromiseExit(
        Effect.flatMap(Canopy, invite('alex', 'sam')).pipe(
          Effect.provide(
            world.service.pipe(
              Layer.provide(
                Layer.mergeAll(
                  MockOutboxLive,
                  timeline.sql,
                  timeline.queue,
                  refusingNotifications
                )
              )
            )
          )
        )
      )

      expect(Exit.hasDies(exit)).toBe(true)
      expect(timeline.events).toEqual(['begin', 'rollback'])
    })

    it('holds the canopy of the inviter, the account of the invitee and the one row the two already have; the canopy and the invitation to withdraw; the invitation alone to decline', async () => {
      const world = sentBy(home(), 'lily')

      await run(world, (canopy) =>
        Effect.all(
          [
            invite('alex', 'sam')(canopy),
            withdraw('alex')(canopy),
            decline('sam')(canopy),
          ],
          { mode: 'result' }
        )
      )

      expect(world.plans).toEqual([
        lockPlan({
          canopy: Find.OfMember({ userId: 'alex' }),
          accounts: ['sam'],
          invitations: InvitationScope.OfInvitee({ invitee: 'sam' }),
        }),
        lockPlan({
          canopy: Find.OfMember({ userId: 'alex' }),
          invitations: InvitationScope.One({ invitationId: 'invitation-1' }),
        }),
        lockPlan({
          invitations: InvitationScope.One({ invitationId: 'invitation-1' }),
        }),
      ])
    })
  })

  describe('sharePlant and unsharePlant', () => {
    const ofAlex: PlantOwner = { _tag: 'User', userId: 'alex' }
    const ofLily: PlantOwner = { _tag: 'User', userId: 'lily' }
    const ofHome: PlantOwner = { _tag: 'Canopy', canopyId: mockCanopyId }

    const garden = (around: MockCanopySurroundings = {}) => {
      const plants = [
        createTestPlant({
          id: 'fern',
          userId: 'alex',
          createdByUserId: 'alex',
          roomId: 'desk',
        }),
        createTestPlant({
          id: 'cactus',
          userId: null,
          canopyId: mockCanopyId,
          createdByUserId: 'lily',
          roomId: 'kitchen',
        }),
        createTestPlant({
          id: 'ivy',
          userId: null,
          canopyId: mockCanopyId,
          createdByUserId: 'alex',
        }),
      ]
      const rooms = [
        createTestRoom({ id: 'desk', userId: 'alex' }),
        createTestRoom({ id: 'kitchen', userId: null, canopyId: mockCanopyId }),
      ]
      return { world: home({ plants, rooms, ...around }), plants }
    }

    const share =
      (plantId: string, by: string, roomId = Option.none<string>()) =>
      (canopy: Service) =>
        canopy.sharePlant({
          permit: mintPermit(plantId, 'share', Actor.User({ userId: by })),
          roomId,
        })

    const unshare =
      (plantId: string, by: string, roomId = Option.none<string>()) =>
      (canopy: Service) =>
        canopy.unsharePlant({
          permit: mintPermit(plantId, 'unshare', Actor.User({ userId: by })),
          roomId,
        })

    const ownerAndRoomOf = (
      plants: ReadonlyArray<ReturnType<typeof createTestPlant>>,
      plantId: string
    ) =>
      Array.map(
        Array.filter(plants, (plant) => plant.id === plantId),
        ({ userId, canopyId, roomId }) => ({ userId, canopyId, roomId })
      )

    const waitingFor = (id: string, userId: string, type: 'photo_reminder') =>
      createTestNotification({
        id,
        userId,
        plantId: 'cactus',
        type,
        status: 'pending',
      })

    it("moves the member's plant into their canopy and one of its rooms, and says who owned it and who owns it", async () => {
      const { world, plants } = garden()

      await run(world, share('fern', 'alex', Option.some('kitchen')))

      expect(ownerAndRoomOf(plants, 'fern')).toEqual([
        { userId: null, canopyId: mockCanopyId, roomId: 'kitchen' },
      ])
      expect(world.events).toEqual([
        { _tag: 'PlantsMoved', plantIds: ['fern'], from: ofAlex, to: ofHome },
      ])
    })

    it('takes a canopy plant back out of its room, drops every mute on it and what the others were waiting to hear about it', async () => {
      const { world, plants } = garden()
      world.store.mutes.push(
        { userId: 'alex', plantId: 'cactus' },
        { userId: 'lily', plantId: 'cactus' },
        { userId: 'lily', plantId: 'ivy' }
      )
      world.notifications.push(
        waitingFor('photo-alex', 'alex', 'photo_reminder'),
        waitingFor('photo-lily', 'lily', 'photo_reminder')
      )

      await run(world, unshare('cactus', 'lily'))

      expect(ownerAndRoomOf(plants, 'cactus')).toEqual([
        { userId: 'lily', canopyId: null, roomId: null },
      ])
      expect(world.store.mutes).toEqual([{ userId: 'lily', plantId: 'ivy' }])
      expect(Array.map(world.notifications, (n) => n.id)).toEqual([
        'photo-lily',
      ])
      expect(world.events).toEqual([
        { _tag: 'PlantsMoved', plantIds: ['cactus'], from: ofHome, to: ofLily },
      ])
    })

    it('locks the actor, their canopy, the room the plant goes into when there is one, then the plant', async () => {
      const { world } = garden()

      await run(world, (canopy) =>
        Effect.all([
          share('fern', 'alex', Option.some('kitchen'))(canopy),
          unshare('cactus', 'lily')(canopy),
        ])
      )

      expect(world.plans).toEqual([
        lockPlan({
          actor: Option.some('alex'),
          canopy: Find.OfMember({ userId: 'alex' }),
          rooms: RoomScope.Pin({ roomId: 'kitchen' }),
          plants: PlantScope.Move({ plantId: 'fern' }),
        }),
        lockPlan({
          actor: Option.some('lily'),
          canopy: Find.OfMember({ userId: 'lily' }),
          plants: PlantScope.Move({ plantId: 'cactus' }),
        }),
      ])
    })

    it('asks the limit of whoever receives a living plant, and no limit for a dead one', async () => {
      const checked: PlantOwner[] = []
      const { world, plants } = garden({
        limits: createMockLimitChecker({ checkedOwners: checked }),
      })

      await run(world, (canopy) =>
        Effect.all([
          share('fern', 'alex')(canopy),
          unshare('cactus', 'lily')(canopy),
        ])
      )
      Array.forEach(plants, (plant) => {
        plant.diedAt = NOW
      })
      await run(world, (canopy) =>
        Effect.all([
          share('cactus', 'lily')(canopy),
          unshare('fern', 'alex')(canopy),
        ])
      )

      expect(checked).toEqual([ofHome, ofLily])
      expect(ownerAndRoomOf(plants, 'cactus')).toMatchObject([
        { canopyId: mockCanopyId },
      ])
      expect(ownerAndRoomOf(plants, 'fern')).toMatchObject([{ userId: 'alex' }])
    })

    it('answers LimitExceededError with what the limit said, and moves nothing', async () => {
      const { world, plants } = garden({
        limits: createMockLimitChecker({ plantLimitReached: true }),
      })

      const errors = [
        await refused(world, share('fern', 'alex')),
        await refused(world, unshare('cactus', 'lily')),
      ]

      expect(errors).toMatchObject([
        { _tag: 'LimitExceededError', feature: 'canopy_plants' },
        { _tag: 'LimitExceededError', feature: 'plants' },
      ])
      expect(ownerAndRoomOf(plants, 'fern')).toMatchObject([{ userId: 'alex' }])
      expect(ownerAndRoomOf(plants, 'cactus')).toMatchObject([
        { canopyId: mockCanopyId },
      ])
    })

    it('answers PlantInDelegationError to a share of a plant in an open delegation', async () => {
      const { world } = garden({
        delegations: createMockDelegationRepository({
          delegations: [
            {
              id: 'away',
              ownerId: 'alex',
              caretakerId: 'noor',
              status: 'pending',
              message: null,
              startDate: NOW,
              endDate: NOW,
              respondedAt: null,
              canceledAt: null,
              completedAt: null,
              createdAt: NOW,
              updatedAt: NOW,
            },
          ],
          delegationPlants: [{ delegationId: 'away', plantId: 'fern' }],
        }),
      })

      expect(await refused(world, share('fern', 'alex'))).toEqual(
        new PlantInDelegationError({ plantId: 'fern' })
      )
    })

    const refusals: ReadonlyArray<
      readonly [
        name: string,
        command: (canopy: Service) => Effect.Effect<void, unknown>,
        error: unknown,
      ]
    > = [
      [
        'CanopyNotFoundError to someone with no canopy',
        share('fern', 'sam'),
        new CanopyNotFoundError(),
      ],
      [
        'PlantNotFoundError to a share of a plant the actor does not own',
        share('fern', 'lily'),
        new PlantNotFoundError({ plantId: 'fern' }),
      ],
      [
        "RoomNotFoundError to a share into a room that is not the canopy's",
        share('fern', 'alex', Option.some('desk')),
        new RoomNotFoundError({ roomId: 'desk' }),
      ],
      [
        'PlantNotAuthorizedError to the canopy owner for a plant its sharer still shares',
        unshare('cactus', 'alex'),
        new PlantNotAuthorizedError(),
      ],
      [
        'PlantNotFoundError to an unshare of a personal plant',
        unshare('fern', 'alex'),
        new PlantNotFoundError({ plantId: 'fern' }),
      ],
      [
        "RoomNotFoundError to an unshare into a room that is not the receiver's",
        unshare('cactus', 'lily', Option.some('kitchen')),
        new RoomNotFoundError({ roomId: 'kitchen' }),
      ],
    ]

    it.each(refusals)('answers %s', async (_name, command, error) => {
      const { world } = garden()

      expect(await refused(world, command)).toEqual(error)
      expect(world.writes).toEqual([])
    })

    it('answers PlantNotFoundError to a job, which moves no plant, and takes no lock', async () => {
      const { world } = garden()

      const errors = [
        await refused(world, (canopy) =>
          canopy.sharePlant({
            permit: systemPermit('fern', 'share', 'a-job'),
            roomId: Option.none(),
          })
        ),
        await refused(world, (canopy) =>
          canopy.unsharePlant({
            permit: systemPermit('cactus', 'unshare', 'a-job'),
            roomId: Option.none(),
          })
        ),
      ]

      expect(errors).toEqual([
        new PlantNotFoundError({ plantId: 'fern' }),
        new PlantNotFoundError({ plantId: 'cactus' }),
      ])
      expect(world.plans).toEqual([])
    })

    it('dies with PlantsNotMovedDefect when a move changes fewer plants than it names', async () => {
      const { world } = garden()

      const exit = await Effect.runPromiseExit(
        Effect.flatMap(CanopyStore, (store) =>
          store.apply([
            CanopyWrite.MovePlants({
              plantIds: ['cactus', 'fern'],
              from: ofHome,
              to: ofLily,
              room: RoomMove.Clear(),
            }),
          ])
        ).pipe(assumingTransaction, Effect.provide(world.storeLayer))
      )

      expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toEqual(
        new PlantsNotMovedDefect({ plantIds: ['cactus', 'fern'], moved: 1 })
      )
    })
  })

  describe('setMute', () => {
    const greenhouse = () =>
      home({
        plants: [
          createTestPlant({
            id: 'cactus',
            userId: null,
            canopyId: mockCanopyId,
            createdByUserId: 'alex',
          }),
          createTestPlant({
            id: 'fern',
            userId: 'alex',
            createdByUserId: 'alex',
          }),
          createTestPlant({
            id: 'orchid',
            userId: null,
            canopyId: otherCanopyId,
            createdByUserId: 'noor',
          }),
        ],
      })

    const mute =
      (plantId: string, by: string, muted = true) =>
      (canopy: Service) =>
        canopy.setMute({
          permit: mintPermit(plantId, 'mute', Actor.User({ userId: by })),
          muted,
        })

    const lilyOnCactus = { userId: 'lily', plantId: 'cactus' }

    it('keeps one mute for a member who mutes a plant twice, and says so both times', async () => {
      const world = greenhouse()

      await run(world, mute('cactus', 'lily'))
      await run(world, mute('cactus', 'lily'))

      expect(world.store.mutes).toEqual([lilyOnCactus])
      expect(world.events).toEqual(
        Array.replicate({ _tag: 'PlantMuted', ...lilyOnCactus }, 2)
      )
    })

    it('takes back the mute of the member who asks and leaves the others their own', async () => {
      const world = greenhouse()
      world.store.mutes.push(
        { userId: 'alex', plantId: 'cactus' },
        lilyOnCactus
      )

      await run(world, mute('cactus', 'lily', false))

      expect(world.store.mutes).toEqual([{ userId: 'alex', plantId: 'cactus' }])
      expect(world.events).toEqual([{ _tag: 'PlantUnmuted', ...lilyOnCactus }])
    })

    it('holds the canopy of the actor, then the plant against deletion and nothing else', async () => {
      const world = greenhouse()

      await run(world, mute('cactus', 'lily'))

      expect(world.plans).toEqual([
        lockPlan({
          canopy: Find.OfMember({ userId: 'lily' }),
          plants: PlantScope.Pin({ plantId: 'cactus' }),
        }),
      ])
    })

    it.each([
      ['a plant that left the canopy for one of its members', 'fern', 'lily'],
      ['a plant of another canopy', 'orchid', 'lily'],
      ['a plant that is gone', 'moss', 'lily'],
      ['someone who has no canopy', 'cactus', 'sam'],
      ['a member of another canopy', 'cactus', 'noor'],
    ])(
      'answers PlantNotFoundError to a mute and to an unmute of %s, and changes no mute',
      async (_name, plantId, by) => {
        const world = greenhouse()
        const before = [lilyOnCactus, { userId: by, plantId }]
        world.store.mutes.push(...before)

        const errors = [
          await refused(world, mute(plantId, by)),
          await refused(world, mute(plantId, by, false)),
        ]

        expect(errors).toEqual(
          Array.replicate(new PlantNotFoundError({ plantId }), 2)
        )
        expect(world.store.mutes).toEqual(before)
        expect(world.events).toEqual([])
      }
    )

    it('answers PlantNotFoundError to a job, which mutes no plant, and takes no lock', async () => {
      const world = greenhouse()

      const error = await refused(world, (canopy) =>
        canopy.setMute({
          permit: systemPermit('cactus', 'mute', 'a-job'),
          muted: true,
        })
      )

      expect(error).toEqual(new PlantNotFoundError({ plantId: 'cactus' }))
      expect(world.plans).toEqual([])
    })
  })

  describe('leave, removeMember and dissolve', () => {
    const shared = (id: string, createdByUserId: string) => ({
      id,
      canopyId: mockCanopyId,
      userId: null,
      createdByUserId,
      roomId: 'kitchen',
      remindersEnabled: true,
      diedAt: null,
    })

    const household = (around: MockCanopySurroundings = {}) =>
      createInMemoryCanopy(
        createCanopyStore({
          canopies: [createTestCanopyRow()],
          members: [
            createTestMembership({
              userId: 'alex',
              name: 'Alex',
              role: 'owner',
              joinedAt: new Date('2024-01-01'),
            }),
            createTestMembership({
              userId: 'noor',
              name: 'Noor',
              language: 'fr',
              joinedAt: new Date('2024-03-01'),
            }),
            createTestMembership({
              userId: 'lily',
              name: 'Lily',
              joinedAt: new Date('2024-06-01'),
            }),
          ],
          plants: [shared('ivy', 'lily'), shared('palm', 'alex')],
          rooms: [{ id: 'kitchen', canopyId: mockCanopyId, userId: null }],
        }),
        [sam],
        around
      )

    const ending = (userId: string) =>
      lockPlan({
        canopy: Find.OfMember({ userId }),
        invitations: InvitationScope.All(),
        rooms: RoomScope.OfCanopy(),
        plants: PlantScope.OfCanopy(),
      })

    const ownersOf = (world: World) =>
      Array.map(world.store.plants, ({ id, userId, canopyId }) => ({
        id,
        userId,
        canopyId,
      }))

    const databaseDown = new SqlError({
      reason: new UnknownError({
        cause: new Error('database unreachable'),
        message: 'database unreachable',
      }),
    })

    it.each<
      readonly [
        string,
        (canopy: Service) => Effect.Effect<unknown, unknown>,
        unknown,
      ]
    >([
      [
        'CanopyNotFoundError to someone with no canopy who leaves',
        (canopy) => canopy.leave({ by: 'sam' }),
        new CanopyNotFoundError(),
      ],
      [
        'CanopyNotFoundError to someone with no canopy who removes a member',
        (canopy) => canopy.removeMember({ by: 'sam', target: 'lily' }),
        new CanopyNotFoundError(),
      ],
      [
        'NotCanopyOwnerError to a member who removes another',
        (canopy) => canopy.removeMember({ by: 'noor', target: 'lily' }),
        new NotCanopyOwnerError(),
      ],
      [
        'CanopyMemberNotFoundError to the owner who removes themself',
        (canopy) => canopy.removeMember({ by: 'alex', target: 'alex' }),
        new CanopyMemberNotFoundError(),
      ],
      [
        'CanopyNotFoundError to someone with no canopy who dissolves one',
        (canopy) => canopy.dissolve({ by: 'sam' }),
        new CanopyNotFoundError(),
      ],
      [
        'NotCanopyOwnerError to a member who dissolves the canopy',
        (canopy) => canopy.dissolve({ by: 'lily' }),
        new NotCanopyOwnerError(),
      ],
    ])('answers %s, and writes nothing', async (_name, command, error) => {
      const world = household()

      expect(await refused(world, command)).toEqual(error)
      expect(world.writes).toEqual([])
      expect(world.notifications).toEqual([])
    })

    it('hands a leaving owner their plants, makes the earliest joiner the owner and queues them a notice in their language that names the leaver', async () => {
      const world = household()

      const outcome = await run(world, (canopy) => canopy.leave({ by: 'alex' }))

      expect(outcome).toBe('left')
      expect(
        Array.map(world.store.members, ({ userId, role }) => [userId, role])
      ).toEqual([
        ['noor', 'owner'],
        ['lily', 'member'],
      ])
      expect(ownersOf(world)).toEqual([
        { id: 'ivy', userId: null, canopyId: mockCanopyId },
        { id: 'palm', userId: 'alex', canopyId: null },
      ])
      expect(world.events).toEqual([
        {
          _tag: 'PlantsMoved',
          plantIds: ['palm'],
          from: { _tag: 'Canopy', canopyId: mockCanopyId },
          to: { _tag: 'User', userId: 'alex' },
        },
        {
          _tag: 'MemberLeft',
          canopyId: mockCanopyId,
          userId: 'alex',
          reason: 'left',
        },
      ])
      expect(world.notifications).toMatchObject([
        {
          userId: 'noor',
          type: 'canopy_member_left',
          status: 'queued',
          body: 'Alex a quitté Home',
        },
      ])
    })

    it('tells a removed member, and nobody else, that they are out', async () => {
      const world = household()

      const outcome = await run(world, (canopy) =>
        canopy.removeMember({ by: 'alex', target: 'lily' })
      )

      expect(outcome).toEqual({ canopyId: mockCanopyId })
      expect(Array.map(world.store.members, (m) => m.userId)).toEqual([
        'alex',
        'noor',
      ])
      expect(world.events).toEqual([
        {
          _tag: 'PlantsMoved',
          plantIds: ['ivy'],
          from: { _tag: 'Canopy', canopyId: mockCanopyId },
          to: { _tag: 'User', userId: 'lily' },
        },
        {
          _tag: 'MemberLeft',
          canopyId: mockCanopyId,
          userId: 'lily',
          reason: 'removed',
        },
      ])
      expect(world.notifications).toMatchObject([
        {
          userId: 'lily',
          type: 'canopy_member_removed',
          status: 'queued',
          body: "You're no longer a member of Home",
        },
      ])
    })

    it('splits a dissolved canopy between its members, leaves no canopy and tells nobody', async () => {
      const world = household()

      await run(world, (canopy) => canopy.dissolve({ by: 'alex' }))

      expect(world.store.canopies).toEqual([])
      expect(world.store.members).toEqual([])
      expect(world.store.plants).toMatchObject([
        { id: 'ivy', userId: 'lily', canopyId: null, roomId: null },
        { id: 'palm', userId: 'alex', canopyId: null, roomId: 'kitchen' },
      ])
      expect(world.store.rooms).toEqual([
        { id: 'kitchen', canopyId: null, userId: 'alex' },
      ])
      expect(Array.map(world.events, (event) => event._tag)).toEqual([
        'PlantsMoved',
        'PlantsMoved',
        'CanopyDissolved',
      ])
      expect(world.notifications).toEqual([])
    })

    it('holds the canopy of the actor with every invitation, room and plant of it, and no delegation', async () => {
      const world = household()

      await run(world, (canopy) =>
        Effect.all([
          canopy.removeMember({ by: 'alex', target: 'lily' }),
          canopy.leave({ by: 'noor' }),
          canopy.dissolve({ by: 'alex' }),
        ])
      )

      expect(world.plans).toEqual([
        ending('alex'),
        ending('noor'),
        ending('alex'),
      ])
      expect(ending('alex')).toMatchObject({
        actor: Option.none(),
        absenceOf: Option.none(),
        accounts: [],
      })
    })

    it('asks no plant limit to move the plants of a departure, with every owner at its limit', async () => {
      const checked: PlantOwner[] = []
      const world = household({
        limits: createMockLimitChecker({
          plantLimitReached: true,
          checkedOwners: checked,
        }),
      })

      await run(world, (canopy) =>
        Effect.all([
          canopy.removeMember({ by: 'alex', target: 'lily' }),
          canopy.leaveForDeletion('noor')(Effect.void),
          canopy.dissolve({ by: 'alex' }),
        ])
      )
      const alone = household({
        limits: createMockLimitChecker({
          plantLimitReached: true,
          checkedOwners: checked,
        }),
      })
      await run(alone, (canopy) => canopy.leave({ by: 'lily' }))

      expect(ownersOf(world)).toEqual([
        { id: 'ivy', userId: 'lily', canopyId: null },
        { id: 'palm', userId: 'alex', canopyId: null },
      ])
      expect(ownersOf(alone)).toEqual([
        { id: 'ivy', userId: 'lily', canopyId: null },
        { id: 'palm', userId: null, canopyId: mockCanopyId },
      ])
      expect(checked).toEqual([])
    })

    describe('leaveForDeletion', () => {
      const deleting =
        <A, E>(userId: string, deletion: Effect.Effect<A, E>) =>
        (canopy: Service) =>
          canopy.leaveForDeletion(userId)(deletion)

      const onTimeline = (
        world: World,
        timeline: ReturnType<typeof createOutboxTimeline>
      ) =>
        world.service.pipe(
          Layer.provide(
            Layer.mergeAll(
              MockOutboxLive,
              timeline.sql,
              timeline.queue,
              createMockNotificationRepository([], timeline.notificationOptions)
            )
          )
        )

      it('locks a user with no canopy and their delegations, runs the deletion and answers what it answered', async () => {
        const world = household()

        const deleted = await run(
          world,
          deleting('sam', Effect.succeed('deleted'))
        )

        expect(deleted).toBe('deleted')
        expect(world.plans).toEqual([
          {
            ...ending('sam'),
            actor: Option.some('sam'),
            absenceOf: Option.some('sam'),
            plants: PlantScope.Leaver({ userId: 'sam' }),
          },
        ])
        expect(world.writes).toEqual([])
      })

      it('takes a member out with the plants they shared left in the canopy, and says their account is why', async () => {
        const world = household()

        await run(world, deleting('lily', Effect.void))

        expect(world.plans).toEqual([
          {
            ...ending('lily'),
            actor: Option.some('lily'),
            absenceOf: Option.some('lily'),
            plants: PlantScope.Leaver({ userId: 'lily' }),
          },
        ])
        expect(Array.map(world.store.members, (m) => m.userId)).toEqual([
          'alex',
          'noor',
        ])
        expect(ownersOf(world)).toEqual([
          { id: 'ivy', userId: null, canopyId: mockCanopyId },
          { id: 'palm', userId: null, canopyId: mockCanopyId },
        ])
        expect(world.events).toEqual([
          {
            _tag: 'MemberLeft',
            canopyId: mockCanopyId,
            userId: 'lily',
            reason: 'accountDeleted',
          },
        ])
      })

      it('runs the deletion after the leave in one transaction, and sends the notice of the leave once it has committed', async () => {
        const timeline = createOutboxTimeline()

        await Effect.runPromise(
          Effect.flatMap(
            Canopy,
            deleting(
              'lily',
              Effect.sync(() => timeline.record('deletion'))
            )
          ).pipe(Effect.provide(onTimeline(household(), timeline)))
        )

        expect(timeline.events).toEqual([
          'begin',
          'insert canopy_member_left alex',
          'deletion',
          'commit',
          'enqueue canopy_member_left alex',
        ])
      })

      it('rolls the leave back, fails as the deletion failed and sends nothing when the deletion fails', async () => {
        const timeline = createOutboxTimeline()

        const exit = await Effect.runPromiseExit(
          Effect.flatMap(
            Canopy,
            deleting('lily', Effect.fail('deletion refused' as const))
          ).pipe(Effect.provide(onTimeline(household(), timeline)))
        )

        expect(failureOf(exit)).toBe('deletion refused')
        expect(timeline.events).toEqual([
          'begin',
          'insert canopy_member_left alex',
          'rollback',
        ])
      })

      it('fails with the SqlError of the store, as a failure its caller can catch, and never runs the deletion', async () => {
        const world = household({
          lockFailure: () => Option.some(databaseDown),
        })
        const ran: string[] = []

        const exit = await Effect.runPromiseExit(
          Effect.flatMap(
            Canopy,
            deleting(
              'lily',
              Effect.sync(() => ran.push('deletion'))
            )
          ).pipe(Effect.provide(world.layer))
        )

        expect(failureOf(exit)).toBe(databaseDown)
        expect(ran).toEqual([])
      })
    })

    it.each([
      [
        'RemoveMember',
        CanopyWrite.RemoveMember({ canopyId: mockCanopyId, userId: 'sam' }),
        { named: 1, written: 0 },
      ],
      [
        'SetOwner',
        CanopyWrite.SetOwner({ canopyId: otherCanopyId, userId: 'lily' }),
        { named: 1, written: 0 },
      ],
      [
        'MoveRooms',
        CanopyWrite.MoveRooms({
          roomIds: ['kitchen', 'attic'],
          canopyId: mockCanopyId,
          toUserId: 'alex',
        }),
        { named: 2, written: 1 },
      ],
    ] as const)(
      'dies with RowsNotWrittenDefect when %s changes another number of rows than it names',
      async (write, named, counts) => {
        const world = household()

        const exit = await Effect.runPromiseExit(
          Effect.flatMap(CanopyStore, (store) => store.apply([named])).pipe(
            assumingTransaction,
            Effect.provide(world.storeLayer)
          )
        )

        expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toEqual(
          new RowsNotWrittenDefect({ write, ...counts })
        )
      }
    )
  })

  describe('holdAsMember', () => {
    it('holds the canopy for one of its members', async () => {
      const world = home()

      await run(world, (canopy) =>
        canopy.holdAsMember({ by: 'lily', canopyId: mockCanopyId })
      )

      expect(world.plans).toEqual([
        lockPlan({ canopy: Find.OfMember({ userId: 'lily' }) }),
      ])
    })

    it.each([
      ['a member of another canopy', 'noor'],
      ['someone with no canopy', 'sam'],
    ])('answers CanopyNotFoundError to %s', async (_name, by) => {
      const world = home()

      const error = await refused(world, (canopy) =>
        canopy.holdAsMember({ by, canopyId: mockCanopyId })
      )

      expect(error).toEqual(new CanopyNotFoundError())
    })
  })

  it('locks the creator and holds their account to create, and the canopy of the actor for everything else', async () => {
    const world = home()
    const ofLily = lockPlan({ canopy: Find.OfMember({ userId: 'lily' }) })

    await run(world, (canopy) =>
      Effect.all([
        canopy.create({ by: 'sam', name: 'Studio' }),
        canopy.update({
          by: 'lily',
          changes: changes({ name: Option.some('Nest') }),
        }),
        canopy.createLink({ by: 'lily' }),
        canopy.revokeLink({ by: 'lily' }),
      ])
    )

    expect(world.plans).toEqual([
      {
        actor: Option.some('sam'),
        canopy: Find.None(),
        absenceOf: Option.none(),
        accounts: ['sam'],
        invitations: InvitationScope.None(),
        rooms: RoomScope.None(),
        plants: PlantScope.None(),
      },
      ofLily,
      ofLily,
      ofLily,
    ])
  })
})
