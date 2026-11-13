import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import {
  delivered,
  dissolve,
  leave,
  settled,
} from '@lily/api/__tests__/integration/canopy-layers'
import { carePermit } from '@lily/api/__tests__/mocks/care'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import {
  Canopy,
  type CanopyChanges,
  hashInviteToken,
  JoinVia,
} from '@lily/api/contexts/canopy'
import { CanopyWrite, RoomMove } from '@lily/api/contexts/canopy/domain/decide'
import {
  CanopyStore,
  CanopyStoreLive,
  Find,
  InvitationScope,
  type LockPlan,
  lockPlan,
  PlantScope,
  PlantsNotMovedDefect,
  RoomScope,
  RowsNotWrittenDefect,
} from '@lily/api/contexts/canopy/store'
import {
  Care,
  CareReadsLive,
  careWhenOf,
  PlanStepChoice,
} from '@lily/api/contexts/care'
import type { Outbox } from '@lily/api/kernel/outbox'
import { Actor, mintPermit } from '@lily/api/kernel/permit'
import { transact } from '@lily/api/kernel/transact'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import {
  PlantRepository,
  PlantRepositoryLive,
} from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import {
  AlreadyInCanopyError,
  CANOPY_INVITE_TTL_DAYS,
  CanopyId,
  CanopyInviteNotFoundError,
  CanopyNotFoundError,
  type PlantOwner,
  RoomNotFoundError,
  UserNotFoundError,
} from '@lily/shared'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import {
  Array,
  Cause,
  DateTime,
  Effect,
  Equal,
  Exit,
  Layer,
  Option,
  Order,
} from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const AppLive = Layer.mergeAll(
  CanopyRepositoryLive,
  Layer.provide(
    CanopyStoreLive,
    Layer.mergeAll(NotificationRepositoryLive, DelegationRepositoryLive)
  ),
  CareScheduleRepositoryLive,
  CareReadsLive,
  DelegationRepositoryLive,
  NotificationRepositoryLive,
  PlantRepositoryLive,
  UserRepositoryLive,
  createMockMessageQueue(),
  createMockEventBus(),
  createMockLimitChecker(),
  createMockWeatherProvider(),
  createMockWeatherCache(),
  createMockWeatherRepository()
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

type App = Layer.Success<typeof AppLive> | Outbox | Canopy

const exitOf = <A, E>(effect: Effect.Effect<A, E, App>) =>
  Effect.runPromiseExit(Effect.provide(settled(effect), AppLive))

const run = <A, E>(effect: Effect.Effect<A, E, App>) =>
  Effect.runPromise(Effect.provide(settled(effect), AppLive))

const exitWithCareOf = <A, E>(effect: Effect.Effect<A, E, App | Care>) =>
  Effect.runPromiseExit(Effect.provide(delivered(effect), AppLive))

const LOCK_NOT_AVAILABLE = '55P03'
const NOW = DateTime.makeUnsafe('2026-11-13T09:00:00Z')

const changes = (given: Partial<CanopyChanges>): CanopyChanges => ({
  name: Option.none(),
  timezone: Option.none(),
  latitude: Option.none(),
  longitude: Option.none(),
  ...given,
})

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Canopy commands - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let alexId: string
    let lilyId: string
    let samId: string
    let canopyId: CanopyId

    const canopies = () =>
      db.select().from(schema.canopies).orderBy(schema.canopies.createdAt)

    const liveLinks = async () =>
      Array.map(
        Array.filter(
          await db.select().from(schema.canopyInvites),
          (link) => link.revokedAt === null
        ),
        (link) => link.createdByUserId
      )

    const anotherSessionCanLock = (
      table:
        | 'canopies'
        | 'users'
        | 'canopy_direct_invites'
        | 'care_delegations'
        | 'rooms'
        | 'plants',
      id: string,
      strength: 'FOR UPDATE' | 'FOR NO KEY UPDATE' | 'FOR KEY SHARE'
    ) =>
      pool
        .query(`SELECT id FROM ${table} WHERE id = $1 ${strength} NOWAIT`, [id])
        .then(
          () => true,
          (error: { code?: string }) => {
            if (error.code === LOCK_NOT_AVAILABLE) return false
            throw error
          }
        )

    const untilLockWaits = async (sessions: number) => {
      for (const _ of Array.range(1, 100)) {
        const { rows } = await pool.query<{ waiting: number }>(
          `SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`
        )
        if ((rows[0]?.waiting ?? 0) >= sessions) return
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      throw new Error(`${sessions} session(s) never waited on a lock`)
    }

    const whileAnotherSessionHolds = async <A, B>(
      lock: readonly [text: string, values: ReadonlyArray<string>],
      waiting: number,
      work: () => Promise<A>,
      during: () => Promise<B>
    ) => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(lock[0], [...lock[1]])
        const working = work()
        const seen = await untilLockWaits(waiting)
          .then(during)
          .finally(() => client.query('ROLLBACK'))
        return { seen, done: await working }
      } finally {
        client.release()
      }
    }

    const membershipsOf = (userId: string) =>
      db
        .select({
          canopyId: schema.canopyMembers.canopyId,
          role: schema.canopyMembers.role,
        })
        .from(schema.canopyMembers)
        .where(eq(schema.canopyMembers.userId, userId))

    const canopyOf = async (owner: string, name: string) => {
      const [created] = await db
        .insert(schema.canopies)
        .values({ name, timezone: 'UTC' })
        .returning()
      if (!created) throw new Error('canopy insert failed')
      await db
        .insert(schema.canopyMembers)
        .values({ canopyId: created.id, userId: owner, role: 'owner' })
      return CanopyId.make(created.id)
    }

    const linkTo = async (to: string, token: string) => {
      await db.insert(schema.canopyInvites).values({
        canopyId: to,
        tokenHash: hashInviteToken(token),
        expiresAt: new Date(Date.now() + 86_400_000),
      })
      return JoinVia.Link({ token })
    }

    const invitationTo = async (
      to: string,
      invitee: string,
      invitedBy: string
    ) => {
      const [invitation] = await db
        .insert(schema.canopyDirectInvites)
        .values({
          canopyId: to,
          inviteeUserId: invitee,
          invitedByUserId: invitedBy,
          expiresAt: new Date(Date.now() + 86_400_000),
        })
        .returning()
      if (!invitation) throw new Error('invitation insert failed')
      return invitation.id
    }

    const join = (joiner: string, via: JoinVia) =>
      Effect.flatMap(Canopy, (canopy) => canopy.join({ joiner, via }))

    const plantOf = async (
      owner: Pick<
        typeof schema.plants.$inferInsert,
        'id' | 'userId' | 'canopyId' | 'createdByUserId' | 'roomId'
      >
    ) => {
      const [plant] = await db
        .insert(schema.plants)
        .values({
          name: 'Monstera',
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
          ...owner,
        })
        .returning()
      if (!plant) throw new Error('plant insert failed')
      return plant.id
    }

    const roomOf = async (
      owner: Pick<typeof schema.rooms.$inferInsert, 'userId' | 'canopyId'>
    ) => {
      const [room] = await db
        .insert(schema.rooms)
        .values({ name: 'Kitchen', ...owner })
        .returning()
      if (!room) throw new Error('room insert failed')
      return room.id
    }

    const whereIs = async (plantId: string) => {
      const [plant] = await db
        .select({
          userId: schema.plants.userId,
          canopyId: schema.plants.canopyId,
          roomId: schema.plants.roomId,
        })
        .from(schema.plants)
        .where(eq(schema.plants.id, plantId))
      return plant
    }

    const share = (
      by: string,
      plantId: string,
      roomId: Option.Option<string>
    ) =>
      Effect.flatMap(Canopy, (canopy) =>
        canopy.sharePlant({
          permit: mintPermit(plantId, 'share', Actor.User({ userId: by })),
          roomId,
        })
      )

    const unshare = (by: string, plantId: string) =>
      Effect.flatMap(Canopy, (canopy) =>
        canopy.unsharePlant({
          permit: mintPermit(plantId, 'unshare', Actor.User({ userId: by })),
          roomId: Option.none(),
        })
      )

    const anotherUser = async (name: string) => {
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `${name}-${Date.now()}@example.com`,
          name,
          emailVerified: true,
          language: 'fr',
        })
        .returning()
      if (!user) throw new Error('user insert failed')
      return user.id
    }

    const invitations = () =>
      db
        .select({
          id: schema.canopyDirectInvites.id,
          canopyId: schema.canopyDirectInvites.canopyId,
          invitee: schema.canopyDirectInvites.inviteeUserId,
          invitedBy: schema.canopyDirectInvites.invitedByUserId,
          status: schema.canopyDirectInvites.status,
        })
        .from(schema.canopyDirectInvites)
        .orderBy(schema.canopyDirectInvites.createdAt)

    const invite = (by: string, invitee: string) =>
      Effect.flatMap(Canopy, (canopy) => canopy.invite({ by, invitee }))

    const later = <A>(ms: number, work: () => Promise<A>) =>
      new Promise((resolve) => setTimeout(resolve, ms)).then(work)

    const deadlocksCounted = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200))
      const { rows } = await pool.query<{ deadlocks: string }>(
        `SELECT deadlocks::text AS deadlocks FROM pg_stat_database WHERE datname = current_database()`
      )
      return Number(rows[0]?.deadlocks ?? 0)
    }

    const outcomeOf = <A>(exit: Exit.Exit<A, unknown>) =>
      Exit.match(exit, {
        onSuccess: (value): unknown => value,
        onFailure: (cause) => Cause.squash(cause),
      })

    const mute = (by: string, plantId: string, muted = true) =>
      Effect.flatMap(Canopy, (canopy) =>
        canopy.setMute({
          permit: mintPermit(plantId, 'mute', Actor.User({ userId: by })),
          muted,
        })
      )

    const mutes = () =>
      db
        .select({
          userId: schema.canopyPlantMutes.userId,
          plantId: schema.canopyPlantMutes.plantId,
        })
        .from(schema.canopyPlantMutes)
        .orderBy(schema.canopyPlantMutes.createdAt)

    const lockAndLoad = (plan: LockPlan) =>
      Effect.flatMap(CanopyStore, (store) => store.lockAndLoad(plan))

    const inOneTransaction = <A, E>(
      effect: Effect.Effect<A, E, App | SqlClient.SqlClient>
    ) => run(transact(effect))

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    afterAll(async () => {
      await pool.end()
    })

    beforeEach(async () => {
      await db.execute(sql`TRUNCATE TABLE outbox RESTART IDENTITY`)
      await db.execute(sql`TRUNCATE TABLE canopies RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      const stamp = Date.now()
      const [alex, lily, sam] = await db
        .insert(schema.users)
        .values(
          Array.map(['Alex', 'Lily', 'Sam'], (name) => ({
            email: `${name}-${stamp}@example.com`,
            name,
            emailVerified: true,
            ...(name === 'Sam'
              ? { timezone: 'Asia/Tokyo', latitude: 35.68, longitude: 139.69 }
              : {}),
          }))
        )
        .returning()
      if (!alex || !lily || !sam) throw new Error('user insert failed')
      alexId = alex.id
      lilyId = lily.id
      samId = sam.id
      const [home] = await db
        .insert(schema.canopies)
        .values({
          name: 'Home',
          timezone: 'Europe/Paris',
          latitude: 48.85,
          longitude: 2.35,
        })
        .returning()
      if (!home) throw new Error('canopy insert failed')
      canopyId = CanopyId.make(home.id)
      await db.insert(schema.canopyMembers).values([
        { canopyId, userId: alexId, role: 'owner' },
        { canopyId, userId: lilyId, role: 'member' },
      ])
    })

    describe('create', () => {
      it('creates the canopy in the timezone and at the location of its creator, who owns it', async () => {
        const created = await run(
          Effect.flatMap(Canopy, (canopy) =>
            canopy.create({ by: samId, name: 'Studio' })
          )
        )

        expect(
          await db
            .select()
            .from(schema.canopies)
            .where(eq(schema.canopies.id, created.canopyId))
        ).toMatchObject([
          {
            name: 'Studio',
            timezone: 'Asia/Tokyo',
            latitude: 35.68,
            longitude: 139.69,
          },
        ])
        expect(
          await db
            .select({
              canopyId: schema.canopyMembers.canopyId,
              role: schema.canopyMembers.role,
            })
            .from(schema.canopyMembers)
            .where(eq(schema.canopyMembers.userId, samId))
        ).toEqual([{ canopyId: created.canopyId, role: 'owner' }])
      })

      it('leaves one canopy and answers AlreadyInCanopyError to the other when one user creates two at once', async () => {
        const create = (name: string) =>
          exitOf(
            Effect.flatMap(Canopy, (canopy) =>
              canopy.create({ by: samId, name })
            )
          )

        const { done } = await whileAnotherSessionHolds(
          ['SELECT id FROM users WHERE id = $1 FOR UPDATE', [samId]],
          2,
          () => Promise.all([create('Studio'), create('Cabin')]),
          () => Promise.resolve()
        )

        const created = Array.filter(
          await canopies(),
          (canopy) => canopy.id !== canopyId
        )
        expect(Array.map(created, (canopy) => canopy.name)).toHaveLength(1)
        expect(Array.filter(done, Exit.isSuccess)).toHaveLength(1)
        expect(
          Array.map(Array.filter(done, Exit.isFailure), failureOf)
        ).toEqual([
          new AlreadyInCanopyError({ canopyName: created[0]?.name ?? '' }),
        ])
      })
    })

    describe('update', () => {
      it('writes the fields it was given and leaves the others, a cleared one included', async () => {
        await run(
          Effect.flatMap(Canopy, (canopy) =>
            canopy.update({
              by: alexId,
              changes: changes({
                timezone: Option.some('Asia/Tokyo'),
                latitude: Option.some(null),
              }),
            })
          )
        )

        expect(await canopies()).toMatchObject([
          {
            name: 'Home',
            timezone: 'Asia/Tokyo',
            latitude: null,
            longitude: 2.35,
          },
        ])
      })
    })

    describe('links', () => {
      const linkBy = (createdBy: string) =>
        CanopyWrite.ReplaceLink({
          canopyId,
          tokenHash: `hash-of-${createdBy}`,
          createdBy,
          expiresAt: DateTime.add(NOW, { days: 7 }),
          at: NOW,
        })

      const revokedFor = async (createdBy: Option.Option<string>) => {
        await run(
          Effect.flatMap(CanopyStore, (store) =>
            store.apply([
              linkBy(alexId),
              CanopyWrite.RevokeLinks({
                canopyId,
                onlyCreatedBy: createdBy,
                at: NOW,
              }),
            ])
          )
        )
        return liveLinks()
      }

      it('revokes the live link whoever made it when no creator is named', async () => {
        expect(await revokedFor(Option.none())).toEqual([])
      })

      it('revokes the live link of the creator named', async () => {
        expect(await revokedFor(Option.some(alexId))).toEqual([])
      })

      it('keeps the live link when the creator named made none', async () => {
        expect(await revokedFor(Option.some(lilyId))).toEqual([alexId])
      })

      it('lets a member revoke the link the owner created', async () => {
        const { token } = await run(
          Effect.flatMap(Canopy, (canopy) =>
            Effect.tap(canopy.createLink({ by: alexId }), () =>
              canopy.revokeLink({ by: lilyId })
            )
          )
        )

        expect(token).not.toBe('')
        expect(await liveLinks()).toEqual([])
      })
    })

    describe('join', () => {
      const whileTheAccountIsHeld = <A>(
        userId: string,
        work: () => Promise<A>
      ) =>
        whileAnotherSessionHolds(
          ['SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]],
          2,
          work,
          () => Promise.resolve()
        )

      it('seats a joiner who comes by link and queues a notice for every member of before', async () => {
        const joined = await run(
          join(samId, await linkTo(canopyId, 'home-token'))
        )

        expect(joined).toEqual({ canopyId })
        expect(await membershipsOf(samId)).toEqual([
          { canopyId, role: 'member' },
        ])
        expect(
          Array.map(
            await db
              .select()
              .from(schema.notifications)
              .orderBy(schema.notifications.userId),
            ({ userId, type, status, body }) => ({ userId, type, status, body })
          )
        ).toEqual(
          Array.map([alexId, lilyId].sort(), (userId) => ({
            userId,
            type: 'canopy_member_joined',
            status: 'queued',
            body: 'Sam joined Home',
          }))
        )
      })

      it('seats an invitee and marks their invitation accepted', async () => {
        const invitationId = await invitationTo(canopyId, samId, lilyId)

        await run(join(samId, JoinVia.Invitation({ invitationId })))

        expect(await membershipsOf(samId)).toEqual([
          { canopyId, role: 'member' },
        ])
        expect(
          await db
            .select({
              status: schema.canopyDirectInvites.status,
              resolved: sql<boolean>`${schema.canopyDirectInvites.resolvedAt} IS NOT NULL`,
            })
            .from(schema.canopyDirectInvites)
        ).toEqual([{ status: 'accepted', resolved: true }])
      })

      it('answers CanopyInviteNotFoundError to a link that was revoked, and to an invitation for someone else', async () => {
        const link = await linkTo(canopyId, 'home-token')
        await db.update(schema.canopyInvites).set({ revokedAt: new Date() })
        const invitationId = await invitationTo(canopyId, lilyId, alexId)

        const refusals = [
          await exitOf(join(samId, link)),
          await exitOf(join(samId, JoinVia.Invitation({ invitationId }))),
        ]

        expect(Array.map(refusals, failureOf)).toEqual([
          new CanopyInviteNotFoundError(),
          new CanopyInviteNotFoundError(),
        ])
        expect(await membershipsOf(samId)).toEqual([])
      })

      it('leaves someone who accepts links to two canopies at once in exactly one, and answers AlreadyInCanopyError to the other', async () => {
        const cabinId = await canopyOf(await anotherUser('Noor'), 'Cabin')
        const links = [
          await linkTo(canopyId, 'home-token'),
          await linkTo(cabinId, 'cabin-token'),
        ]

        const { done } = await whileTheAccountIsHeld(samId, () =>
          Promise.all(Array.map(links, (link) => exitOf(join(samId, link))))
        )

        const [membership, ...others] = await membershipsOf(samId)
        expect(others).toEqual([])
        expect(Array.filter(done, Exit.isSuccess)).toEqual([
          Exit.succeed({ canopyId: membership?.canopyId }),
        ])
        expect(
          Array.map(Array.filter(done, Exit.isFailure), failureOf)
        ).toEqual([
          new AlreadyInCanopyError({
            canopyName: membership?.canopyId === canopyId ? 'Home' : 'Cabin',
          }),
        ])
      })

      it('leaves someone who creates a canopy and accepts a link at once in exactly one, round after round', async () => {
        const link = await linkTo(canopyId, 'home-token')
        const round = async () => {
          const { done } = await whileTheAccountIsHeld(samId, () =>
            Promise.all([
              exitOf(
                Effect.flatMap(Canopy, (canopy) =>
                  canopy.create({ by: samId, name: 'Studio' })
                )
              ),
              exitOf(join(samId, link)),
            ])
          )
          const memberships = await membershipsOf(samId)
          await db
            .delete(schema.canopies)
            .where(eq(schema.canopies.name, 'Studio'))
          await db
            .delete(schema.canopyMembers)
            .where(eq(schema.canopyMembers.userId, samId))
          return {
            memberships: memberships.length,
            successes: Array.filter(done, Exit.isSuccess).length,
            refusals: Array.map(
              Array.filter(done, Exit.isFailure),
              (exit) => failureOf(exit)._tag
            ),
          }
        }

        const rounds = []
        for (const _ of Array.range(1, 10)) rounds.push(await round())

        expect(rounds).toEqual(
          Array.replicate(
            {
              memberships: 1,
              successes: 1,
              refusals: ['AlreadyInCanopyError'],
            },
            10
          )
        )
      })
    })

    describe('invitations', () => {
      const withdraw = (by: string, invitationId: string) =>
        Effect.flatMap(Canopy, (canopy) =>
          canopy.withdrawInvitation({ by, invitationId })
        )

      const decline = (by: string, invitationId: string) =>
        Effect.flatMap(Canopy, (canopy) =>
          canopy.declineInvitation({ by, invitationId })
        )

      const accept = (joiner: string, invitationId: string) =>
        Effect.as(join(joiner, JoinVia.Invitation({ invitationId })), 'joined')

      it('opens an invitation good for the invite lifetime and queues the invitee a notice, in their language, that points at it', async () => {
        const noorId = await anotherUser('Noor')
        const before = Date.now()

        const invited = await run(invite(lilyId, noorId))

        const [opened] = await db.select().from(schema.canopyDirectInvites)
        expect(invited).toEqual({ canopyId })
        expect(opened).toMatchObject({
          canopyId,
          inviteeUserId: noorId,
          invitedByUserId: lilyId,
          status: 'pending',
          resolvedAt: null,
        })
        expect(
          ((opened?.expiresAt.getTime() ?? 0) - before) / 86_400_000
        ).toBeCloseTo(CANOPY_INVITE_TTL_DAYS, 2)
        expect(
          Array.map(
            await db.select().from(schema.notifications),
            ({ userId, type, status, body, metadata }) => ({
              userId,
              type,
              status,
              body,
              metadata,
            })
          )
        ).toEqual([
          {
            userId: noorId,
            type: 'canopy_invitation',
            status: 'queued',
            body: "Lily t'invite à rejoindre Home",
            metadata: { invitationId: opened?.id },
          },
        ])
      })

      it('opens the row the canopy already has for the invitee again, under its id and in the name of the new inviter, and leaves the rows of other canopies alone', async () => {
        const cabinId = await canopyOf(await anotherUser('Noor'), 'Cabin')
        const first = await invitationTo(canopyId, samId, lilyId)
        await db
          .update(schema.canopyDirectInvites)
          .set({ status: 'withdrawn', resolvedAt: new Date() })
        const elsewhere = await invitationTo(cabinId, samId, lilyId)
        await db
          .update(schema.canopyDirectInvites)
          .set({ status: 'declined', resolvedAt: new Date(0) })
          .where(eq(schema.canopyDirectInvites.id, elsewhere))

        await run(invite(alexId, samId))

        expect(await invitations()).toEqual([
          {
            id: elsewhere,
            canopyId: cabinId,
            invitee: samId,
            invitedBy: lilyId,
            status: 'declined',
          },
          {
            id: first,
            canopyId,
            invitee: samId,
            invitedBy: alexId,
            status: 'pending',
          },
        ])
      })

      it.each([
        { account: 'suspended', given: { status: 'suspended' as const } },
        { account: 'being deleted', given: { deletedAt: new Date() } },
      ])(
        'answers UserNotFoundError to an invitation of an account that is $account, and opens none',
        async ({ given }) => {
          await db
            .update(schema.users)
            .set(given)
            .where(eq(schema.users.id, samId))

          const invited = await exitOf(invite(alexId, samId))

          expect(outcomeOf(invited)).toEqual(
            new UserNotFoundError({ userId: samId })
          )
          expect(await invitations()).toEqual([])
        }
      )

      it('withdraws an invitation of the canopy for its owner, and answers CanopyInviteNotFoundError for one of another canopy', async () => {
        const cabinId = await canopyOf(await anotherUser('Noor'), 'Cabin')
        const ours = await invitationTo(canopyId, samId, lilyId)
        const theirs = await invitationTo(cabinId, samId, lilyId)

        const exits = [
          await exitOf(withdraw(alexId, ours)),
          await exitOf(withdraw(alexId, theirs)),
        ]

        expect(Array.map(exits, outcomeOf)).toEqual([
          { canopyId },
          new CanopyInviteNotFoundError(),
        ])
        expect(
          Array.map(await invitations(), ({ id, status }) => ({ id, status }))
        ).toEqual([
          { id: ours, status: 'withdrawn' },
          { id: theirs, status: 'pending' },
        ])
      })

      it.each([
        {
          first: 'accept' as const,
          accepted: 'joined',
          declined: new CanopyInviteNotFoundError(),
          status: 'accepted',
          seats: [{ role: 'member' }],
        },
        {
          first: 'decline' as const,
          accepted: new CanopyInviteNotFoundError(),
          declined: undefined,
          status: 'declined',
          seats: [],
        },
      ])(
        'leaves an invitation $status, and a seat only if accepted, when the $first reaches its row before the other',
        async ({ first, accepted, declined, status, seats }) => {
          const invitationId = await invitationTo(canopyId, samId, lilyId)
          const accepting = (): Promise<Exit.Exit<unknown, unknown>> =>
            exitOf(accept(samId, invitationId))
          const declining = (): Promise<Exit.Exit<unknown, unknown>> =>
            exitOf(decline(samId, invitationId))
          const [starts, follows] =
            first === 'accept' ? [accepting, declining] : [declining, accepting]

          const { seen, done } = await whileAnotherSessionHolds(
            [
              'SELECT id FROM canopy_direct_invites WHERE id = $1 FOR UPDATE',
              [invitationId],
            ],
            1,
            starts,
            async () => {
              const followed = follows()
              await untilLockWaits(2)
              return { followed }
            }
          )
          const followed = await seen.followed
          const [acceptExit, declineExit] =
            first === 'accept' ? [done, followed] : [followed, done]

          expect({
            accepted: outcomeOf(acceptExit),
            declined: outcomeOf(declineExit),
            status: Array.map(await invitations(), (row) => row.status),
            seats: Array.map(await membershipsOf(samId), ({ role }) => ({
              role,
            })),
          }).toEqual({ accepted, declined, status: [status], seats })
        }
      )

      it('ends an accept and a decline of one invitation at once accepted with a seat or declined with none, round after round, with no deadlock', async () => {
        const before = await deadlocksCounted()
        const round = async (n: number) => {
          const invitationId = await invitationTo(canopyId, samId, lilyId)
          const exits: ReadonlyArray<Exit.Exit<unknown, unknown>> =
            await Promise.all([
              exitOf(accept(samId, invitationId)),
              later(n, () => exitOf(decline(samId, invitationId))),
            ])
          const [invitation] = await invitations()
          const seats = (await membershipsOf(samId)).length
          await db.delete(schema.canopyDirectInvites)
          await db
            .delete(schema.canopyMembers)
            .where(eq(schema.canopyMembers.userId, samId))
          return {
            consistent:
              (invitation?.status === 'accepted' && seats === 1) ||
              (invitation?.status === 'declined' && seats === 0),
            succeeded: Array.filter(exits, Exit.isSuccess).length,
            refused: Array.map(Array.filter(exits, Exit.isFailure), outcomeOf),
          }
        }

        const rounds = []
        for (const n of Array.range(1, 20)) rounds.push(await round(n))

        expect(rounds).toEqual(
          Array.replicate(
            {
              consistent: true,
              succeeded: 1,
              refused: [new CanopyInviteNotFoundError()],
            },
            20
          )
        )
        expect((await deadlocksCounted()) - before).toBe(0)
      }, 30_000)

      it('answers UserNotFoundError to an invitation that waited for the hard delete of its invitee to commit', async () => {
        const client = await pool.connect()

        try {
          await client.query('BEGIN')
          await client.query('DELETE FROM users WHERE id = $1', [samId])
          const inviting = exitOf(invite(alexId, samId))
          await untilLockWaits(1)
          await client.query('COMMIT')

          expect(outcomeOf(await inviting)).toEqual(
            new UserNotFoundError({ userId: samId })
          )
        } finally {
          client.release()
        }
        expect(await invitations()).toEqual([])
      })

      it('makes the hard delete of an invitee wait for an invitation to them, then takes the invitation away with the account', async () => {
        const earlier = await invitationTo(canopyId, samId, lilyId)
        await db
          .update(schema.canopyDirectInvites)
          .set({ status: 'withdrawn', resolvedAt: new Date() })

        const { done } = await whileAnotherSessionHolds(
          [
            'SELECT id FROM canopy_direct_invites WHERE id = $1 FOR UPDATE',
            [earlier],
          ],
          2,
          () =>
            Promise.all([
              exitOf(invite(alexId, samId)),
              untilLockWaits(1).then(() =>
                pool.query('DELETE FROM users WHERE id = $1', [samId])
              ),
            ]),
          () => Promise.resolve()
        )

        expect(outcomeOf(done[0])).toEqual({ canopyId })
        expect(done[1].rowCount).toBe(1)
        expect(await invitations()).toEqual([])
      })

      it('ends an invitation racing the hard delete of its invitee sent or refused, round after round, with no defect and no deadlock', async () => {
        const before = await deadlocksCounted()
        const round = async (n: number) => {
          const inviteeId = await anotherUser(`Guest-${n}`)
          const [invited] = await Promise.all([
            exitOf(invite(alexId, inviteeId)),
            later(n, () =>
              pool.query('DELETE FROM users WHERE id = $1', [inviteeId])
            ),
          ])
          return Exit.isSuccess(invited)
            ? 'invited'
            : Equal.equals(
                  outcomeOf(invited),
                  new UserNotFoundError({ userId: inviteeId })
                )
              ? 'refused'
              : outcomeOf(invited)
        }

        const rounds = []
        for (const n of Array.range(1, 20)) rounds.push(await round(n))

        expect(
          Array.filter(
            rounds,
            (outcome) => outcome !== 'invited' && outcome !== 'refused'
          )
        ).toEqual([])
        expect(await invitations()).toEqual([])
        expect((await deadlocksCounted()) - before).toBe(0)
      }, 30_000)
    })

    describe('sharePlant and unsharePlant', () => {
      it("moves a member's plant into the canopy and one of its rooms", async () => {
        const plantId = await plantOf({
          userId: alexId,
          createdByUserId: alexId,
        })
        const kitchenId = await roomOf({ canopyId })

        await run(share(alexId, plantId, Option.some(kitchenId)))

        expect(await whereIs(plantId)).toEqual({
          userId: null,
          canopyId,
          roomId: kitchenId,
        })
      })

      it('takes a canopy plant back out of its room, and drops its mutes and what the other members were waiting to hear about it', async () => {
        const kitchenId = await roomOf({ canopyId })
        const shared = {
          canopyId,
          createdByUserId: lilyId,
          roomId: kitchenId,
        }
        const plantId = await plantOf(shared)
        const stayingId = await plantOf(shared)
        await db.insert(schema.canopyPlantMutes).values([
          { userId: alexId, plantId },
          { userId: lilyId, plantId },
          { userId: alexId, plantId: stayingId },
        ])
        await db.insert(schema.notifications).values(
          Array.map(
            [
              [alexId, plantId],
              [lilyId, plantId],
              [alexId, stayingId],
            ] as const,
            ([userId, about]) => ({
              type: 'photo_reminder' as const,
              scheduledAt: new Date(Date.now() + 86_400_000),
              userId,
              plantId: about,
              status: 'pending' as const,
            })
          )
        )

        await run(unshare(lilyId, plantId))

        expect(await whereIs(plantId)).toEqual({
          userId: lilyId,
          canopyId: null,
          roomId: null,
        })
        expect(
          await db
            .select({
              userId: schema.canopyPlantMutes.userId,
              plantId: schema.canopyPlantMutes.plantId,
            })
            .from(schema.canopyPlantMutes)
        ).toEqual([{ userId: alexId, plantId: stayingId }])
        const waiting = await db
          .select({
            userId: schema.notifications.userId,
            plantId: schema.notifications.plantId,
          })
          .from(schema.notifications)
          .where(eq(schema.notifications.type, 'photo_reminder'))
        expect(waiting).toHaveLength(2)
        expect(waiting).toEqual(
          expect.arrayContaining([
            { userId: lilyId, plantId },
            { userId: alexId, plantId: stayingId },
          ])
        )
      })

      it('answers RoomNotFoundError and leaves the plant personal when its target room is deleted before the share can lock it', async () => {
        const plantId = await plantOf({
          userId: alexId,
          createdByUserId: alexId,
        })
        const kitchenId = await roomOf({ canopyId })

        const { done } = await whileAnotherSessionHolds(
          ['SELECT pg_advisory_xact_lock(1, hashtext($1))', [alexId]],
          1,
          () => exitOf(share(alexId, plantId, Option.some(kitchenId))),
          () => pool.query('DELETE FROM rooms WHERE id = $1', [kitchenId])
        )

        expect(failureOf(done)).toEqual(
          new RoomNotFoundError({ roomId: kitchenId })
        )
        expect(await whereIs(plantId)).toEqual({
          userId: alexId,
          canopyId: null,
          roomId: null,
        })
      })

      it('makes the delete of its target room wait for the share, which ends with the plant in the canopy and in no room', async () => {
        const plantId = await plantOf({
          userId: alexId,
          createdByUserId: alexId,
        })
        const kitchenId = await roomOf({ canopyId })

        const { done } = await whileAnotherSessionHolds(
          ['SELECT id FROM plants WHERE id = $1 FOR UPDATE', [plantId]],
          2,
          () =>
            Promise.all([
              exitOf(share(alexId, plantId, Option.some(kitchenId))),
              untilLockWaits(1).then(() =>
                pool.query('DELETE FROM rooms WHERE id = $1', [kitchenId])
              ),
            ]),
          () => Promise.resolve()
        )

        expect(Exit.isSuccess(done[0])).toBe(true)
        expect(done[1].rowCount).toBe(1)
        expect(await whereIs(plantId)).toEqual({
          userId: null,
          canopyId,
          roomId: null,
        })
      })

      it('ends a share racing the delete of its target room in the canopy with no room or refused, round after round, with no defect', async () => {
        const round = async () => {
          const plantId = await plantOf({
            userId: alexId,
            createdByUserId: alexId,
          })
          const kitchenId = await roomOf({ canopyId })
          const [shared] = await Promise.all([
            exitOf(share(alexId, plantId, Option.some(kitchenId))),
            pool.query('DELETE FROM rooms WHERE id = $1', [kitchenId]),
          ])
          const refusedFor = new RoomNotFoundError({ roomId: kitchenId })
          return {
            consistent: Exit.isSuccess(shared)
              ? (await whereIs(plantId))?.canopyId === canopyId
              : Exit.hasFails(shared) &&
                failureOf(shared)._tag === refusedFor._tag &&
                (await whereIs(plantId))?.userId === alexId,
            roomId: (await whereIs(plantId))?.roomId,
          }
        }

        const rounds = []
        for (const _ of Array.range(1, 10)) rounds.push(await round())

        expect(rounds).toEqual(
          Array.replicate({ consistent: true, roomId: null }, 10)
        )
      })
    })

    describe('setMute', () => {
      const canopyPlant = () => plantOf({ canopyId, createdByUserId: alexId })

      it('keeps one mute for a member who mutes a plant twice, and takes back theirs alone', async () => {
        const plantId = await canopyPlant()
        await db
          .insert(schema.canopyPlantMutes)
          .values({ userId: alexId, plantId })

        await run(mute(lilyId, plantId))
        await run(mute(lilyId, plantId))
        const muted = await mutes()
        await run(mute(lilyId, plantId, false))

        expect(muted).toEqual([
          { userId: alexId, plantId },
          { userId: lilyId, plantId },
        ])
        expect(await mutes()).toEqual([{ userId: alexId, plantId }])
      })

      it('makes the delete of a plant wait for a mute of it, then takes the mute away with the plant', async () => {
        const plantId = await canopyPlant()

        const { done } = await whileAnotherSessionHolds(
          ['SELECT id FROM users WHERE id = $1 FOR UPDATE', [lilyId]],
          2,
          () =>
            Promise.all([
              exitOf(mute(lilyId, plantId)),
              untilLockWaits(1).then(() =>
                pool.query('DELETE FROM plants WHERE id = $1', [plantId])
              ),
            ]),
          () => Promise.resolve()
        )

        expect(outcomeOf(done[0])).toBeUndefined()
        expect(done[1].rowCount).toBe(1)
        expect(await mutes()).toEqual([])
      })

      it('answers PlantNotFoundError to a mute that waited for the delete of its plant to commit', async () => {
        const plantId = await canopyPlant()
        const client = await pool.connect()

        try {
          await client.query('BEGIN')
          await client.query('DELETE FROM plants WHERE id = $1', [plantId])
          const muting = exitOf(mute(lilyId, plantId))
          await untilLockWaits(1)
          await client.query('COMMIT')

          expect(outcomeOf(await muting)).toEqual(
            new PlantNotFoundError({ plantId })
          )
        } finally {
          client.release()
        }
        expect(await mutes()).toEqual([])
      })

      it('ends a mute racing the delete of its plant muted or refused, round after round, with no defect and no deadlock', async () => {
        const before = await deadlocksCounted()
        const round = async (n: number) => {
          const plantId = await canopyPlant()
          const [muted] = await Promise.all([
            exitOf(mute(lilyId, plantId)),
            later(n, () =>
              run(
                Effect.flatMap(PlantRepository, (repo) =>
                  repo.delete(plantId, { _tag: 'Canopy', canopyId })
                )
              )
            ),
          ])
          return Exit.isSuccess(muted) ? 'muted' : outcomeOf(muted)
        }

        const rounds = []
        for (const n of Array.range(1, 20)) rounds.push(await round(n))

        expect(
          Array.filter(
            rounds,
            (outcome) =>
              outcome !== 'muted' && !(outcome instanceof PlantNotFoundError)
          )
        ).toEqual([])
        expect(await mutes()).toEqual([])
        expect((await deadlocksCounted()) - before).toBe(0)
      }, 30_000)

      it.each([
        {
          who: 'someone who left the canopy',
          leaves: () =>
            db
              .delete(schema.canopyMembers)
              .where(eq(schema.canopyMembers.userId, lilyId)),
        },
        {
          who: 'a member once the plant left the canopy',
          leaves: () =>
            db
              .update(schema.plants)
              .set({ userId: alexId, canopyId: null })
              .where(eq(schema.plants.canopyId, canopyId)),
        },
      ])(
        'answers PlantNotFoundError to an unmute and to a mute by $who, and deletes no mute',
        async ({ leaves }) => {
          const plantId = await canopyPlant()
          const other = await canopyPlant()
          await db
            .insert(schema.canopyPlantMutes)
            .values({ userId: lilyId, plantId })
          await leaves()

          const exits = [
            await exitOf(mute(lilyId, plantId, false)),
            await exitOf(mute(lilyId, other)),
          ]

          expect(Array.map(exits, outcomeOf)).toEqual([
            new PlantNotFoundError({ plantId }),
            new PlantNotFoundError({ plantId: other }),
          ])
          expect(await mutes()).toEqual([{ userId: lilyId, plantId }])
        }
      )
    })

    describe('leave and dissolve', () => {
      const feed = (by: string, plantIds: ReadonlyArray<string>) =>
        Effect.flatMap(Care, (care) =>
          care.record({
            permits: Array.map(plantIds, (plantId) => carePermit(plantId, by)),
            careType: 'fertilization',
            on: careWhenOf(undefined),
            notes: Option.none(),
            photoUrl: Option.none(),
            planStep: PlanStepChoice.Auto(),
          })
        )

      it.each([
        { handedBackFirst: 'higher' as const },
        { handedBackFirst: 'lower' as const },
      ])(
        'ends a dissolve racing a care of two of its plants with no deadlock, when the plant it hands back first has the $handedBackFirst id',
        async ({ handedBackFirst }) => {
          const [lower, higher] = Array.sort(
            [crypto.randomUUID(), crypto.randomUUID()],
            Order.String
          )
          if (lower === undefined || higher === undefined) {
            throw new Error('two ids expected')
          }
          const [sharedByLily, sharedByAlex] =
            handedBackFirst === 'higher' ? [higher, lower] : [lower, higher]
          await plantOf({ id: sharedByLily, canopyId, createdByUserId: lilyId })
          await plantOf({ id: sharedByAlex, canopyId, createdByUserId: alexId })
          const before = await deadlocksCounted()

          const { seen, done } = await whileAnotherSessionHolds(
            ['SELECT id FROM plants WHERE id = $1 FOR UPDATE', [higher]],
            1,
            () => exitWithCareOf(dissolve(alexId)),
            async () => {
              const cared = exitWithCareOf(feed(alexId, [higher, lower]))
              await untilLockWaits(2)
              return { cared }
            }
          )
          const cared = await seen.cared

          expect({
            dissolved: Exit.isSuccess(done),
            cared: Exit.isSuccess(cared)
              ? Array.map(cared.value, (outcome) => outcome._tag)
              : outcomeOf(cared),
            deadlocks: (await deadlocksCounted()) - before,
          }).toEqual({
            dissolved: true,
            cared: ['Recorded', 'Recorded'],
            deadlocks: 0,
          })
          expect([
            await canopies(),
            await whereIs(sharedByLily),
            await whereIs(sharedByAlex),
          ]).toMatchObject([
            [],
            { userId: lilyId, canopyId: null },
            { userId: alexId, canopyId: null },
          ])
        },
        30_000
      )

      it.each([
        {
          first: 'leave' as const,
          left: 'dissolved',
          joined: new CanopyInviteNotFoundError(),
          members: [],
        },
        {
          first: 'join' as const,
          left: 'left',
          joined: 'joined',
          members: ['owner'],
        },
      ])(
        'gives the canopy of an owner who leaves alone to whoever joined before the $first took the canopy row, and never leaves it with no owner',
        async ({ first, left, joined, members }) => {
          await db
            .delete(schema.canopyMembers)
            .where(eq(schema.canopyMembers.userId, lilyId))
          const link = await linkTo(canopyId, 'home-token')
          const leaving = (): Promise<Exit.Exit<unknown, unknown>> =>
            exitOf(leave(alexId))
          const joining = (): Promise<Exit.Exit<unknown, unknown>> =>
            exitOf(Effect.as(join(samId, link), 'joined'))
          const [starts, follows] =
            first === 'leave' ? [leaving, joining] : [joining, leaving]

          const { seen, done } = await whileAnotherSessionHolds(
            ['SELECT id FROM canopies WHERE id = $1 FOR UPDATE', [canopyId]],
            1,
            starts,
            async () => {
              const followed = follows()
              await untilLockWaits(2)
              return { followed }
            }
          )
          const followed = await seen.followed
          const [leaveExit, joinExit] =
            first === 'leave' ? [done, followed] : [followed, done]

          expect({
            left: outcomeOf(leaveExit),
            joined: outcomeOf(joinExit),
            members: Array.map(
              await membershipsOf(samId),
              (member) => member.role
            ),
            canopies: (await canopies()).length,
            ofAlex: await membershipsOf(alexId),
          }).toEqual({
            left,
            joined,
            members,
            canopies: members.length,
            ofAlex: [],
          })
        }
      )
    })

    describe('holdAsMember', () => {
      const hold = (by: string, held: string) =>
        Effect.flatMap(Canopy, (canopy) =>
          canopy.holdAsMember({ by, canopyId: held })
        )

      it('answers CanopyNotFoundError to someone who is not a member of that canopy', async () => {
        const other = await run(
          Effect.flatMap(Canopy, (canopy) =>
            canopy.create({ by: samId, name: 'Studio' })
          )
        )

        const refusals = await Promise.all([
          exitOf(transact(hold(samId, canopyId))),
          exitOf(transact(hold(lilyId, other.canopyId))),
        ])

        expect(Array.map(refusals, failureOf)).toEqual([
          new CanopyNotFoundError(),
          new CanopyNotFoundError(),
        ])
      })

      it('keeps the canopy row locked until the transaction of its caller ends', async () => {
        const during = await inOneTransaction(
          Effect.andThen(
            hold(lilyId, canopyId),
            Effect.promise(() =>
              anotherSessionCanLock('canopies', canopyId, 'FOR UPDATE')
            )
          )
        )

        expect({
          during,
          after: await anotherSessionCanLock(
            'canopies',
            canopyId,
            'FOR UPDATE'
          ),
        }).toEqual({ during: false, after: true })
      })
    })

    describe('lockAndLoad', () => {
      it('holds a named account against deletion and not against a profile edit, until the transaction ends', async () => {
        const during = await inOneTransaction(
          Effect.gen(function* () {
            const held = yield* lockAndLoad(
              lockPlan({ accounts: [samId, crypto.randomUUID()] })
            )
            return {
              accounts: Array.fromIterable(held.accounts.values()),
              deletable: yield* Effect.promise(() =>
                anotherSessionCanLock('users', samId, 'FOR UPDATE')
              ),
              editable: yield* Effect.promise(() =>
                anotherSessionCanLock('users', samId, 'FOR NO KEY UPDATE')
              ),
            }
          })
        )

        expect(during).toEqual({
          accounts: [
            {
              userId: samId,
              name: 'Sam',
              language: 'en',
              timezone: 'Asia/Tokyo',
              location: Option.some({ latitude: 35.68, longitude: 139.69 }),
              reachable: true,
            },
          ],
          deletable: false,
          editable: true,
        })
        expect(await anotherSessionCanLock('users', samId, 'FOR UPDATE')).toBe(
          true
        )
      })

      it('waits for the lock of the actor before it touches the canopy row', async () => {
        const { seen, done } = await whileAnotherSessionHolds(
          ['SELECT pg_advisory_xact_lock(1, hashtext($1))', [alexId]],
          1,
          () =>
            inOneTransaction(
              lockAndLoad(
                lockPlan({
                  actor: Option.some(alexId),
                  canopy: Find.OfMember({ userId: alexId }),
                })
              )
            ),
          () => anotherSessionCanLock('canopies', canopyId, 'FOR UPDATE')
        )

        expect(seen).toBe(true)
        expect(Option.map(done.canopy, (canopy) => canopy.id)).toEqual(
          Option.some(canopyId)
        )
      })

      it('waits for an account before it touches an invitation, then holds the invitation until the transaction ends', async () => {
        const invitationId = await invitationTo(canopyId, samId, lilyId)
        const invitationIsFree = () =>
          anotherSessionCanLock(
            'canopy_direct_invites',
            invitationId,
            'FOR UPDATE'
          )

        const { seen, done } = await whileAnotherSessionHolds(
          ['SELECT id FROM users WHERE id = $1 FOR UPDATE', [samId]],
          1,
          () =>
            inOneTransaction(
              Effect.gen(function* () {
                const held = yield* lockAndLoad(
                  lockPlan({
                    accounts: [samId],
                    invitations: InvitationScope.One({ invitationId }),
                  })
                )
                return {
                  held: Array.map(held.invitations, (invitation) => ({
                    id: invitation.id,
                    invitee: invitation.invitee,
                    status: invitation.status,
                  })),
                  free: yield* Effect.promise(invitationIsFree),
                }
              })
            ),
          invitationIsFree
        )

        expect({ whileWaitingForTheAccount: seen, ...done }).toEqual({
          whileWaitingForTheAccount: true,
          held: [{ id: invitationId, invitee: samId, status: 'pending' }],
          free: false,
        })
        expect(await invitationIsFree()).toBe(true)
      })

      it('waits for the account of an invitee before it touches the one row its canopy has for them, and holds no row another canopy has for them', async () => {
        const cabinId = await canopyOf(await anotherUser('Noor'), 'Cabin')
        const ours = await invitationTo(canopyId, samId, lilyId)
        const theirs = await invitationTo(cabinId, samId, lilyId)
        await invitationTo(canopyId, await anotherUser('Guest'), lilyId)
        const isFree = (invitationId: string) => () =>
          anotherSessionCanLock(
            'canopy_direct_invites',
            invitationId,
            'FOR UPDATE'
          )

        const { seen, done } = await whileAnotherSessionHolds(
          ['SELECT id FROM users WHERE id = $1 FOR UPDATE', [samId]],
          1,
          () =>
            inOneTransaction(
              Effect.gen(function* () {
                const held = yield* lockAndLoad(
                  lockPlan({
                    canopy: Find.OfMember({ userId: alexId }),
                    accounts: [samId],
                    invitations: InvitationScope.OfInvitee({ invitee: samId }),
                  })
                )
                return {
                  held: Array.map(held.invitations, (invitation) => ({
                    id: invitation.id,
                    invitee: invitation.invitee,
                    invitedBy: invitation.invitedBy,
                  })),
                  oursIsFree: yield* Effect.promise(isFree(ours)),
                  theirsIsFree: yield* Effect.promise(isFree(theirs)),
                }
              })
            ),
          isFree(ours)
        )

        expect({ oursWasFreeWhileWaitingForTheAccount: seen, ...done }).toEqual(
          {
            oursWasFreeWhileWaitingForTheAccount: true,
            held: [{ id: ours, invitee: samId, invitedBy: lilyId }],
            oursIsFree: false,
            theirsIsFree: true,
          }
        )
        expect(await isFree(ours)()).toBe(true)
      })

      it('holds no invitation for an invitee when no canopy is held', async () => {
        await invitationTo(canopyId, samId, lilyId)

        const held = await inOneTransaction(
          lockAndLoad(
            lockPlan({
              invitations: InvitationScope.OfInvitee({ invitee: samId }),
            })
          )
        )

        expect(held.invitations).toEqual([])
      })

      it('loads and locks no invitation of a canopy other than the one it holds', async () => {
        const cabinId = await canopyOf(samId, 'Cabin')
        const invitationId = await invitationTo(cabinId, lilyId, samId)

        const during = await inOneTransaction(
          Effect.gen(function* () {
            const held = yield* lockAndLoad(
              lockPlan({
                canopy: Find.OfMember({ userId: alexId }),
                invitations: InvitationScope.One({ invitationId }),
              })
            )
            return {
              invitations: held.invitations,
              free: yield* Effect.promise(() =>
                anotherSessionCanLock(
                  'canopy_direct_invites',
                  invitationId,
                  'FOR UPDATE'
                )
              ),
            }
          })
        )

        expect(during).toEqual({ invitations: [], free: true })
      })

      it('finds the canopy of a link or of an invitation, and reads its live link under the lock', async () => {
        const invitationId = await invitationTo(canopyId, samId, lilyId)
        await linkTo(canopyId, 'home-token')
        const found = (canopy: Find) =>
          inOneTransaction(
            Effect.map(lockAndLoad(lockPlan({ canopy })), (held) =>
              Option.map(held.canopy, (state) => ({
                id: state.id,
                members: Array.sort(
                  Array.map(state.members, (member) => member.userId),
                  Order.String
                ),
                link: Option.map(state.link, (link) => link.tokenHash),
              }))
            )
          )
        const home = Option.some({
          id: canopyId,
          members: Array.sort([alexId, lilyId], Order.String),
          link: Option.some(hashInviteToken('home-token')),
        })

        expect([
          await found(
            Find.ByLink({ tokenHash: hashInviteToken('home-token') })
          ),
          await found(Find.ByInvitation({ invitationId })),
          await found(Find.ByLink({ tokenHash: 'no-such-hash' })),
          await found(Find.ByInvitation({ invitationId: crypto.randomUUID() })),
        ]).toEqual([home, home, Option.none(), Option.none()])
      })

      it('waits for the room before it touches the plant, then holds the room against deletion and the plant against a change of owner until the transaction ends', async () => {
        const plantId = await plantOf({
          userId: alexId,
          createdByUserId: alexId,
        })
        const kitchenId = await roomOf({ canopyId })
        const plantIsFree = () =>
          anotherSessionCanLock('plants', plantId, 'FOR NO KEY UPDATE')
        const roomIsFree = () =>
          anotherSessionCanLock('rooms', kitchenId, 'FOR UPDATE')

        const { seen, done } = await whileAnotherSessionHolds(
          ['SELECT id FROM rooms WHERE id = $1 FOR UPDATE', [kitchenId]],
          1,
          () =>
            inOneTransaction(
              Effect.gen(function* () {
                const held = yield* lockAndLoad(
                  lockPlan({
                    rooms: RoomScope.Pin({ roomId: kitchenId }),
                    plants: PlantScope.Move({ plantId }),
                  })
                )
                return {
                  rooms: held.rooms,
                  plants: held.plants,
                  roomIsFree: yield* Effect.promise(roomIsFree),
                  roomCanBeEdited: yield* Effect.promise(() =>
                    anotherSessionCanLock(
                      'rooms',
                      kitchenId,
                      'FOR NO KEY UPDATE'
                    )
                  ),
                  plantIsFree: yield* Effect.promise(plantIsFree),
                  plantCanBeReferenced: yield* Effect.promise(() =>
                    anotherSessionCanLock('plants', plantId, 'FOR KEY SHARE')
                  ),
                }
              })
            ),
          plantIsFree
        )

        const ofHome: PlantOwner = { _tag: 'Canopy', canopyId }
        const ofAlex: PlantOwner = { _tag: 'User', userId: alexId }
        expect({ plantWasFreeWhileWaitingForTheRoom: seen, ...done }).toEqual({
          plantWasFreeWhileWaitingForTheRoom: true,
          rooms: [{ id: kitchenId, owner: ofHome }],
          plants: [
            {
              id: plantId,
              owner: ofAlex,
              sharer: Option.some(alexId),
              living: true,
            },
          ],
          roomIsFree: false,
          roomCanBeEdited: true,
          plantIsFree: false,
          plantCanBeReferenced: true,
        })
        expect([await roomIsFree(), await plantIsFree()]).toEqual([true, true])
      })

      it('pins a plant against deletion and not against a care or a change of owner, until the transaction ends', async () => {
        const plantId = await plantOf({ canopyId, createdByUserId: alexId })
        const canBeDeleted = () =>
          anotherSessionCanLock('plants', plantId, 'FOR UPDATE')

        const done = await inOneTransaction(
          Effect.gen(function* () {
            const held = yield* lockAndLoad(
              lockPlan({ plants: PlantScope.Pin({ plantId }) })
            )
            return {
              plants: held.plants,
              canBeDeleted: yield* Effect.promise(canBeDeleted),
              canChangeOwner: yield* Effect.promise(() =>
                anotherSessionCanLock('plants', plantId, 'FOR NO KEY UPDATE')
              ),
            }
          })
        )

        expect(done).toEqual({
          plants: [
            {
              id: plantId,
              owner: { _tag: 'Canopy', canopyId },
              sharer: Option.some(alexId),
              living: true,
            },
          ],
          canBeDeleted: false,
          canChangeOwner: true,
        })
        expect(await canBeDeleted()).toBe(true)
      })

      it('dies with PlantsNotMovedDefect and moves nothing when a move names a plant its old owner does not hold', async () => {
        const mine = await plantOf({ userId: alexId, createdByUserId: alexId })
        const shared = await plantOf({ canopyId, createdByUserId: alexId })
        const plantIds = [mine, shared] as const

        const exit = await exitOf(
          transact(
            Effect.flatMap(CanopyStore, (store) =>
              store.apply([
                CanopyWrite.MovePlants({
                  plantIds,
                  from: { _tag: 'Canopy', canopyId },
                  to: { _tag: 'User', userId: lilyId },
                  room: RoomMove.Clear(),
                }),
              ])
            )
          )
        )

        expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toEqual(
          new PlantsNotMovedDefect({ plantIds, moved: 1 })
        )
        expect(await whereIs(shared)).toMatchObject({ userId: null, canopyId })
      })

      it('holds every invitation, room and plant of the canopy it holds until the transaction ends, and none of another canopy', async () => {
        const cabinId = await canopyOf(samId, 'Cabin')
        const home = {
          invitation: await invitationTo(canopyId, samId, lilyId),
          room: await roomOf({ canopyId }),
          plant: await plantOf({ canopyId, createdByUserId: lilyId }),
        }
        const cabin = {
          invitation: await invitationTo(cabinId, lilyId, samId),
          room: await roomOf({ canopyId: cabinId }),
          plant: await plantOf({ canopyId: cabinId, createdByUserId: samId }),
        }
        const free = async (of: typeof home) => ({
          invitation: await anotherSessionCanLock(
            'canopy_direct_invites',
            of.invitation,
            'FOR UPDATE'
          ),
          room: await anotherSessionCanLock(
            'rooms',
            of.room,
            'FOR NO KEY UPDATE'
          ),
          plant: await anotherSessionCanLock(
            'plants',
            of.plant,
            'FOR NO KEY UPDATE'
          ),
        })

        const during = await inOneTransaction(
          Effect.gen(function* () {
            const held = yield* lockAndLoad(
              lockPlan({
                canopy: Find.OfMember({ userId: alexId }),
                invitations: InvitationScope.All(),
                rooms: RoomScope.OfCanopy(),
                plants: PlantScope.OfCanopy(),
              })
            )
            return {
              held: {
                invitation: Array.map(held.invitations, (row) => row.id),
                room: Array.map(held.rooms, (row) => row.id),
                plant: Array.map(held.plants, (row) => row.id),
              },
              home: yield* Effect.promise(() => free(home)),
              cabin: yield* Effect.promise(() => free(cabin)),
              roomCanBeReferenced: yield* Effect.promise(() =>
                anotherSessionCanLock('rooms', home.room, 'FOR KEY SHARE')
              ),
            }
          })
        )

        const all = { invitation: true, room: true, plant: true }
        expect(during).toEqual({
          held: {
            invitation: [home.invitation],
            room: [home.room],
            plant: [home.plant],
          },
          home: { invitation: false, room: false, plant: false },
          cabin: all,
          roomCanBeReferenced: true,
        })
        expect(await free(home)).toEqual(all)
      })

      it('holds no invitation, room or plant for someone who has no canopy', async () => {
        const invitationId = await invitationTo(canopyId, samId, lilyId)
        const roomId = await roomOf({ canopyId })
        const plantId = await plantOf({ canopyId, createdByUserId: lilyId })

        const during = await inOneTransaction(
          Effect.gen(function* () {
            const held = yield* lockAndLoad(
              lockPlan({
                canopy: Find.OfMember({ userId: samId }),
                invitations: InvitationScope.All(),
                rooms: RoomScope.OfCanopy(),
                plants: PlantScope.OfCanopy(),
              })
            )
            return {
              held: [held.invitations, held.rooms, held.plants],
              free: yield* Effect.promise(() =>
                Promise.all([
                  anotherSessionCanLock(
                    'canopy_direct_invites',
                    invitationId,
                    'FOR UPDATE'
                  ),
                  anotherSessionCanLock('rooms', roomId, 'FOR UPDATE'),
                  anotherSessionCanLock('plants', plantId, 'FOR UPDATE'),
                ])
              ),
            }
          })
        )

        expect(during).toEqual({
          held: [[], [], []],
          free: [true, true, true],
        })
      })

      describe('the delegations of a user', () => {
        const delegationOf = async (ownerId: string, caretakerId: string) => {
          const [delegation] = await db
            .insert(schema.careDelegations)
            .values({
              ownerId,
              caretakerId,
              status: 'active',
              startDate: new Date(Date.now() - 86_400_000),
              endDate: new Date(Date.now() + 86_400_000),
            })
            .returning()
          if (!delegation) throw new Error('delegation insert failed')
          return delegation.id
        }

        const delegationIsFree = (delegationId: string) => () =>
          anotherSessionCanLock('care_delegations', delegationId, 'FOR UPDATE')

        it('waits for the canopy row before it touches a delegation', async () => {
          const isFree = delegationIsFree(await delegationOf(alexId, samId))

          const { seen } = await whileAnotherSessionHolds(
            ['SELECT id FROM canopies WHERE id = $1 FOR UPDATE', [canopyId]],
            1,
            () =>
              inOneTransaction(
                lockAndLoad(
                  lockPlan({
                    canopy: Find.OfMember({ userId: alexId }),
                    delegationsOf: Option.some(alexId),
                  })
                )
              ),
            isFree
          )

          expect(seen).toBe(true)
        })

        it('waits for a delegation before it touches an account, then holds every delegation the user is a party to until the transaction ends', async () => {
          const given = await delegationOf(alexId, samId)
          const taken = await delegationOf(lilyId, alexId)
          const ofOthers = await delegationOf(lilyId, samId)
          const free = () =>
            Promise.all(
              Array.map([given, taken, ofOthers], (id) =>
                delegationIsFree(id)()
              )
            )

          const { seen, done } = await whileAnotherSessionHolds(
            [
              'SELECT id FROM care_delegations WHERE id = $1 FOR UPDATE',
              [given],
            ],
            1,
            () =>
              inOneTransaction(
                Effect.andThen(
                  lockAndLoad(
                    lockPlan({
                      delegationsOf: Option.some(alexId),
                      accounts: [samId],
                    })
                  ),
                  Effect.promise(free)
                )
              ),
            () => anotherSessionCanLock('users', samId, 'FOR UPDATE')
          )

          expect({
            accountWasFreeWhileWaitingForTheDelegation: seen,
            freeUnderTheLock: done,
            freeAfter: await free(),
          }).toEqual({
            accountWasFreeWhileWaitingForTheDelegation: true,
            freeUnderTheLock: [false, false, true],
            freeAfter: [true, true, true],
          })
        })
      })

      it.each<
        readonly [
          RowsNotWrittenDefect['write'],
          (rooms: readonly [string, string]) => CanopyWrite,
          number,
        ]
      >([
        [
          'RemoveMember',
          () => CanopyWrite.RemoveMember({ canopyId, userId: samId }),
          1,
        ],
        [
          'SetOwner',
          () => CanopyWrite.SetOwner({ canopyId, userId: samId }),
          1,
        ],
        [
          'MoveRooms',
          (roomIds) =>
            CanopyWrite.MoveRooms({ roomIds, canopyId, toUserId: alexId }),
          2,
        ],
      ])(
        'dies with RowsNotWrittenDefect and writes nothing when %s names a row the canopy does not have',
        async (write, writeOf, named) => {
          const cabinId = await canopyOf(samId, 'Cabin')
          const kitchenId = await roomOf({ canopyId })
          const roomIds = [
            kitchenId,
            await roomOf({ canopyId: cabinId }),
          ] as const

          const exit = await exitOf(
            transact(
              Effect.flatMap(CanopyStore, (store) =>
                store.apply([
                  CanopyWrite.RemoveMember({ canopyId, userId: lilyId }),
                  writeOf(roomIds),
                ])
              )
            )
          )

          expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toEqual(
            new RowsNotWrittenDefect({ write, named, written: named - 1 })
          )
          expect({
            lily: await membershipsOf(lilyId),
            kitchen: await db
              .select({ canopyId: schema.rooms.canopyId })
              .from(schema.rooms)
              .where(eq(schema.rooms.id, kitchenId)),
          }).toEqual({
            lily: [{ canopyId, role: 'member' }],
            kitchen: [{ canopyId }],
          })
        }
      )

      it('waits for the canopy row before it touches an account', async () => {
        const { seen, done } = await whileAnotherSessionHolds(
          ['SELECT id FROM canopies WHERE id = $1 FOR UPDATE', [canopyId]],
          1,
          () =>
            inOneTransaction(
              lockAndLoad(
                lockPlan({
                  canopy: Find.OfMember({ userId: alexId }),
                  accounts: [samId],
                })
              )
            ),
          () => anotherSessionCanLock('users', samId, 'FOR UPDATE')
        )

        expect(seen).toBe(true)
        expect(Array.fromIterable(done.accounts.keys()).sort()).toEqual(
          [alexId, lilyId, samId].sort()
        )
      })
    })
  }
)
