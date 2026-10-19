import {
  ActivityPushTokenRepository,
  ActivityPushTokenRepositoryLive,
} from '@lily/api/repositories/activity-push-token.repository'
import {
  type INotificationRepository,
  NotificationRepository,
  NotificationRepositoryLive,
} from '@lily/api/repositories/notification.repository'
import { DrizzleLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { eq, inArray, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import {
  Array as Arr,
  type Config,
  ConfigProvider,
  Effect,
  Layer,
  Option,
} from 'effect'
import type { SqlError } from 'effect/sql/SqlError'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000)

interface SeedRow {
  status: 'pending' | 'queued'
  queuedAt: Date | null
  deliveryMessageId?: string
}

const pendingRow: SeedRow = { status: 'pending', queuedAt: null }

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Notification claims - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let userId: string
    let deviceTokenId: string
    let RepositoriesLive: Layer.Layer<
      NotificationRepository | ActivityPushTokenRepository,
      Config.ConfigError | SqlError
    >

    const run = <A, E>(
      effect: Effect.Effect<
        A,
        E,
        NotificationRepository | ActivityPushTokenRepository
      >
    ) => Effect.runPromise(effect.pipe(Effect.provide(RepositoriesLive)))

    const withRepo = <A, E>(
      f: (repo: INotificationRepository) => Effect.Effect<A, E>
    ) => run(Effect.flatMap(NotificationRepository, f))

    const insertRows = async (rows: ReadonlyArray<SeedRow>) => {
      const inserted = await db
        .insert(schema.notifications)
        .values(
          Arr.map(rows, (row) => ({
            type: 'watering_reminder',
            title: 'Water',
            body: 'Water your plant',
            userId,
            scheduledAt: minutesAgo(5),
            status: row.status,
            queuedAt: row.queuedAt,
            deliveryMessageId: Option.getOrNull(
              Option.fromNullishOr(row.deliveryMessageId)
            ),
          }))
        )
        .returning({ id: schema.notifications.id })
      return Arr.map(inserted, (row) => row.id)
    }

    const statusesOf = async (ids: ReadonlyArray<string>) => {
      const rows = await db
        .select({
          id: schema.notifications.id,
          status: schema.notifications.status,
        })
        .from(schema.notifications)
        .where(inArray(schema.notifications.id, [...ids]))
      const byId = new Map(Arr.map(rows, (row) => [row.id, row.status]))
      return Arr.map(ids, (id) => byId.get(id))
    }

    const truncateRuns = async () => {
      await db.execute(
        sql`TRUNCATE TABLE notifications RESTART IDENTITY CASCADE`
      )
      await db.execute(
        sql`TRUNCATE TABLE activity_push_tokens RESTART IDENTITY CASCADE`
      )
    }

    beforeAll(async () => {
      const url = process.env.DATABASE_URL_TEST
      if (!url) throw new Error('DATABASE_URL_TEST is not set')
      pool = new Pool({ connectionString: url })
      db = drizzle(pool, { schema })
      RepositoriesLive = Layer.mergeAll(
        NotificationRepositoryLive,
        ActivityPushTokenRepositoryLive
      ).pipe(
        Layer.provide(DrizzleLive),
        Layer.provide(
          ConfigProvider.layer(
            ConfigProvider.fromUnknown({ DATABASE_URL: url })
          )
        )
      )

      await truncateRuns()
      await db.execute(
        sql`TRUNCATE TABLE device_tokens RESTART IDENTITY CASCADE`
      )
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)

      const [user] = await db
        .insert(schema.users)
        .values({
          email: `claims-${Date.now()}@example.com`,
          name: 'claims_user',
          emailVerified: true,
          role: 'user',
          status: 'active',
        })
        .returning()
      if (!user) throw new Error('Failed to create test user')
      userId = user.id

      const [deviceToken] = await db
        .insert(schema.deviceTokens)
        .values({ token: 'expo-claims-token', platform: 'ios', userId })
        .returning()
      if (!deviceToken) throw new Error('Failed to create device token')
      deviceTokenId = deviceToken.id
    })

    beforeEach(truncateRuns)

    afterAll(async () => {
      await truncateRuns()
      await db.execute(
        sql`TRUNCATE TABLE device_tokens RESTART IDENTITY CASCADE`
      )
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      await pool.end()
    })

    describe('claimPendingToSchedule', () => {
      it('hands each due row to exactly one of two concurrent claimers', async () => {
        const ids = await insertRows(Arr.makeBy(20, () => pendingRow))

        const [first, second] = await withRepo((repo) =>
          Effect.all(
            [repo.claimPendingToSchedule(10), repo.claimPendingToSchedule(10)],
            { concurrency: 'unbounded' }
          )
        )
        const claimed = Arr.map([...first, ...second], (n) => n.id)

        expect(claimed).toHaveLength(20)
        expect(new Set(claimed)).toEqual(new Set(ids))
        expect(await statusesOf(ids)).toEqual(Arr.makeBy(20, () => 'queued'))

        const third = await withRepo((repo) => repo.claimPendingToSchedule(10))
        expect(third).toHaveLength(0)
      })

      it('skips rows another transaction holds locked instead of waiting', async () => {
        const ids = await insertRows(Arr.makeBy(6, () => pendingRow))
        const locked = Arr.take(ids, 2)
        const free = Arr.drop(ids, 2)

        const holder = await pool.connect()
        try {
          await holder.query('BEGIN')
          await holder.query(
            'SELECT id FROM notifications WHERE id = ANY($1) FOR UPDATE',
            [locked]
          )

          const claimed = await withRepo((repo) =>
            repo.claimPendingToSchedule(10)
          )

          expect(new Set(Arr.map(claimed, (n) => n.id))).toEqual(new Set(free))
        } finally {
          await holder.query('ROLLBACK')
          holder.release()
        }

        expect(await statusesOf(locked)).toEqual(['pending', 'pending'])
      })

      it('never returns a row inserted directly as queued', async () => {
        const created = await withRepo((repo) =>
          repo.create({
            type: 'new_follower',
            title: 'New follower',
            body: 'Ada follows you',
            scheduledAt: new Date(),
            userId,
            status: 'queued',
          })
        )
        const claimed = await withRepo((repo) =>
          repo.claimPendingToSchedule(10)
        )

        expect(created?.status).toBe('queued')
        expect(claimed).toHaveLength(0)
      })
    })

    describe('claimForDelivery', () => {
      const queuedNow: SeedRow = { status: 'queued', queuedAt: new Date() }

      it('gives the rows to one message and nothing to its duplicate', async () => {
        const ids = await insertRows([queuedNow, queuedNow])

        const [a, b] = await withRepo((repo) =>
          Effect.all(
            [
              repo.claimForDelivery(ids, 'msg-a'),
              repo.claimForDelivery(ids, 'msg-b'),
            ],
            { concurrency: 'unbounded' }
          )
        )

        expect(new Set([...a, ...b])).toEqual(new Set(ids))
        expect(a.length === 0 || b.length === 0).toBe(true)

        const winner = a.length > 0 ? 'msg-a' : 'msg-b'
        const again = await withRepo((repo) =>
          repo.claimForDelivery(ids, winner)
        )
        expect(new Set(again)).toEqual(new Set(ids))
      })

      it('claims nothing once the rows left the queued state', async () => {
        const ids = await insertRows([queuedNow])

        await withRepo((repo) =>
          Effect.andThen(
            repo.claimForDelivery(ids, 'msg-a'),
            repo.markManyAsSent(ids)
          )
        )
        const late = await withRepo((repo) =>
          repo.claimForDelivery(ids, 'msg-a')
        )
        await withRepo((repo) => repo.markManyAsFailed(ids, 'too late'))

        expect(late).toHaveLength(0)
        expect(await statusesOf(ids)).toEqual(['sent'])
      })
    })

    describe('recovery sweep', () => {
      it('releases unclaimed stale rows and fails abandoned deliveries', async () => {
        const ids = await insertRows([
          { status: 'queued', queuedAt: minutesAgo(11) },
          { status: 'queued', queuedAt: minutesAgo(1) },
          {
            status: 'queued',
            queuedAt: minutesAgo(90),
            deliveryMessageId: 'msg-abandoned',
          },
          { status: 'queued', queuedAt: null },
          {
            status: 'queued',
            queuedAt: minutesAgo(20),
            deliveryMessageId: 'msg-in-flight',
          },
        ])

        const released = await withRepo((repo) =>
          repo.releaseUnclaimedOlderThan(minutesAgo(10))
        )
        const failed = await withRepo((repo) =>
          repo.failAbandonedDeliveries(minutesAgo(60), 'delivery not confirmed')
        )

        expect(released).toBe(1)
        expect(failed).toBe(2)
        expect(await statusesOf(ids)).toEqual([
          'pending',
          'queued',
          'failed',
          'failed',
          'queued',
        ])
      })
    })

    describe('claimStartTokens', () => {
      const insertStartToken = async () => {
        await db.insert(schema.activityPushTokens).values({
          userId,
          deviceTokenId,
          kind: 'start',
          token: 'push-to-start-token',
          status: 'active',
        })
      }

      const claimStart = Effect.flatMap(ActivityPushTokenRepository, (repo) =>
        repo.claimStartTokens(userId, [deviceTokenId], minutesAgo(600))
      )

      it('lets exactly one of two concurrent callers start the device', async () => {
        await insertStartToken()

        const results = await run(
          Effect.all([claimStart, claimStart], { concurrency: 'unbounded' })
        )

        expect(Arr.flatten(results)).toEqual([deviceTokenId])
      })

      it('frees the device again once the phone confirmed the start', async () => {
        await insertStartToken()

        expect(await run(claimStart)).toEqual([deviceTokenId])
        expect(await run(claimStart)).toEqual([])

        await db
          .update(schema.activityPushTokens)
          .set({ lastConfirmedAt: new Date(Date.now() + 1000) })
          .where(eq(schema.activityPushTokens.deviceTokenId, deviceTokenId))

        expect(await run(claimStart)).toEqual([deviceTokenId])
      })
    })
  }
)
