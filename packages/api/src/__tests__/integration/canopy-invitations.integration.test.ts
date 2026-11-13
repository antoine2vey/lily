import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { CareReadsLive } from '@lily/api/contexts/care'
import {
  CanopyRepository,
  CanopyRepositoryLive,
} from '@lily/api/repositories/canopy.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { acceptCanopyInvitation } from '@lily/api/services/canopy/endpoints/accept-canopy-invitation'
import { leaveCanopy } from '@lily/api/services/canopy/helpers/leave-canopy'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, Effect, Exit, Layer } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const AppLive = Layer.mergeAll(
  CanopyRepositoryLive,
  CareScheduleRepositoryLive,
  CareReadsLive,
  DelegationRepositoryLive,
  NotificationRepositoryLive,
  PlantRepositoryLive,
  UserRepositoryLive,
  createMockMessageQueue()
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const run = <A, E>(
  effect: Effect.Effect<A, E, Layer.Success<typeof AppLive>>
) => Effect.runPromise(Effect.provide(effect, AppLive))

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000)

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Canopy invitations - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let alexId: string
    let lilyId: string
    let samId: string
    let carolId: string
    let canopyId: string

    const invite = (
      inviteeUserId: string,
      invitedByUserId: string,
      expiresAt = inDays(7)
    ) =>
      run(
        Effect.flatMap(CanopyRepository, (repo) =>
          repo.upsertInvitation({
            canopyId,
            inviteeUserId,
            invitedByUserId,
            expiresAt,
          })
        )
      )

    const invitationsFor = (inviteeUserId: string) =>
      db
        .select()
        .from(schema.canopyDirectInvites)
        .where(eq(schema.canopyDirectInvites.inviteeUserId, inviteeUserId))

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    beforeEach(async () => {
      await db.execute(sql`TRUNCATE TABLE canopies RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      const stamp = Date.now()
      const [alex, lily, sam, carol] = await db
        .insert(schema.users)
        .values(
          Array.map(['Alex', 'Lily', 'Sam', 'Carol'], (name) => ({
            email: `${name}-${stamp}@example.com`,
            name,
            emailVerified: true,
          }))
        )
        .returning()
      if (!alex || !lily || !sam || !carol)
        throw new Error('user insert returned nothing')
      alexId = alex.id
      carolId = carol.id
      lilyId = lily.id
      samId = sam.id
      const [canopy] = await db
        .insert(schema.canopies)
        .values({ name: 'Home' })
        .returning()
      if (!canopy) throw new Error('canopy insert returned nothing')
      canopyId = canopy.id
      await db.insert(schema.canopyMembers).values([
        { canopyId, userId: alexId, role: 'owner' },
        { canopyId, userId: samId, role: 'member' },
      ])
    })

    afterAll(async () => {
      await db.execute(sql`TRUNCATE TABLE canopies RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      await pool.end()
    })

    it('reopens the same row when a resolved invitation is sent again', async () => {
      const first = await invite(lilyId, samId)
      await run(
        Effect.flatMap(CanopyRepository, (repo) =>
          repo.transitionInvitation(first.id, 'pending', 'withdrawn')
        )
      )

      const again = await invite(lilyId, alexId)

      expect(await invitationsFor(lilyId)).toEqual([
        expect.objectContaining({
          id: first.id,
          status: 'pending',
          invitedByUserId: alexId,
          resolvedAt: null,
        }),
      ])
      expect(again.id).toBe(first.id)
    })

    it('previews the Canopy, the inviter and the member count', async () => {
      const { id } = await invite(lilyId, samId)

      const preview = await run(
        Effect.flatMap(CanopyRepository, (repo) =>
          repo.findInvitationPreview(id)
        )
      )

      expect(preview).toMatchObject({
        id,
        canopyName: 'Home',
        inviterName: 'Sam',
        memberCount: 2,
      })
    })

    it('lists only pending invitations that have not lapsed', async () => {
      const open = await invite(lilyId, samId)
      await invite(carolId, samId, inDays(-1))

      const pending = await run(
        Effect.flatMap(CanopyRepository, (repo) =>
          repo.findPendingInvitations(canopyId)
        )
      )

      expect(pending).toEqual([
        {
          id: open.id,
          invitee: { userId: lilyId, name: 'Lily', image: null },
          invitedByUserId: samId,
          expiresAt: open.expiresAt,
        },
      ])
    })

    it('withdraws what a member sent when they leave, and nothing else', async () => {
      await invite(lilyId, samId)
      await invite(carolId, alexId)

      await run(leaveCanopy(samId))

      expect(Array.map(await invitationsFor(lilyId), (i) => i.status)).toEqual([
        'withdrawn',
      ])
      expect(Array.map(await invitationsFor(carolId), (i) => i.status)).toEqual(
        ['pending']
      )
    })

    it('admits the invitee once when they accept twice at the same time', async () => {
      const { id } = await invite(lilyId, samId)
      const accept = () =>
        Effect.runPromiseExit(
          acceptCanopyInvitation(id).pipe(
            Effect.provide(
              Layer.merge(AppLive, createMockCurrentUser({ id: lilyId }))
            )
          )
        )

      const exits = await Promise.all([accept(), accept()])

      expect(Array.every(exits, Exit.isSuccess)).toBe(true)
      expect(
        await db
          .select({ userId: schema.canopyMembers.userId })
          .from(schema.canopyMembers)
          .where(eq(schema.canopyMembers.userId, lilyId))
      ).toEqual([{ userId: lilyId }])
      expect(Array.map(await invitationsFor(lilyId), (i) => i.status)).toEqual([
        'accepted',
      ])
    })
  }
)
