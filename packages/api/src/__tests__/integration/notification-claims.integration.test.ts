import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import {
  ActivityPushTokenRepository,
  ActivityPushTokenRepositoryLive,
} from '@lily/api/repositories/activity-push-token.repository'
import {
  type CanopyRepository,
  CanopyRepositoryLive,
} from '@lily/api/repositories/canopy.repository'
import {
  type CareScheduleRepository,
  CareScheduleRepositoryLive,
} from '@lily/api/repositories/care-schedule.repository'
import {
  type DelegationRepository,
  DelegationRepositoryLive,
} from '@lily/api/repositories/delegation.repository'
import {
  type INotificationRepository,
  NotificationRepository,
  NotificationRepositoryLive,
} from '@lily/api/repositories/notification.repository'
import {
  type PlantRepository,
  PlantRepositoryLive,
} from '@lily/api/repositories/plant.repository'
import {
  type UserRepository,
  UserRepositoryLive,
} from '@lily/api/repositories/user.repository'
import { createDrainableScheduler } from '@lily/api/services/helpers/create-scheduler'
import {
  BATCH_SIZE,
  pollAndEnqueue,
} from '@lily/api/services/notification-scheduler/scheduler'
import { DrizzleLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import type { NotificationTopic, QueueMessage } from '@lily/shared/server'
import { eq, inArray, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import {
  Array as Arr,
  type Config,
  ConfigProvider,
  Effect,
  Layer,
  Option,
  References,
  String as Str,
} from 'effect'
import type { SqlError } from 'effect/sql/SqlError'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000)

const KOLKATA_OFFSET_MINUTES = 330

const kolkataClock = (date: Date) =>
  new Date(date.getTime() + KOLKATA_OFFSET_MINUTES * 60_000)
    .toISOString()
    .slice(11, 16)

const etcZoneWithLocalHour = (localHour: number, now: Date) => {
  const offset = ((localHour - now.getUTCHours() + 36) % 24) - 12
  if (offset === 0) return 'UTC'
  return offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`
}

const floorToHour = (date: Date) =>
  new Date(Math.floor(date.getTime() / 3_600_000) * 3_600_000)

const floorToMinute = (date: Date) =>
  new Date(Math.floor(date.getTime() / 60_000) * 60_000)

interface SeedRow {
  status: 'pending' | 'queued' | 'sent' | 'failed'
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
      | NotificationRepository
      | ActivityPushTokenRepository
      | UserRepository
      | PlantRepository
      | CanopyRepository
      | CareScheduleRepository
      | DelegationRepository,
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
            type: 'watering_reminder' as const,
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
        ActivityPushTokenRepositoryLive,
        UserRepositoryLive,
        PlantRepositoryLive,
        CanopyRepositoryLive,
        CareScheduleRepositoryLive,
        DelegationRepositoryLive
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
            params: { senderName: 'Ada' },
            scheduledAt: new Date(),
            userId,
            status: 'queued',
            metadata: { senderId: 'ada' },
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
            repo.markManyAsSent(
              ids.map((id) => ({ id, title: 'New follower', body: 'Ada' }))
            )
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

    describe('deferred rows', () => {
      const poll = (enqueued: QueueMessage[]) =>
        Effect.runPromise(
          pollAndEnqueue.pipe(
            Effect.provide(
              Layer.merge(
                RepositoriesLive,
                createMockMessageQueue({
                  onEnqueue: (_topic: NotificationTopic, message) =>
                    enqueued.push(message),
                })
              )
            ),
            Effect.provideService(References.MinimumLogLevel, 'None')
          )
        )

      const insertUser = async (
        name: string,
        settings: Partial<typeof schema.users.$inferInsert>
      ) => {
        const [user] = await db
          .insert(schema.users)
          .values({
            email: `${name}-${Date.now()}@example.com`,
            name,
            emailVerified: true,
            ...settings,
          })
          .returning({ id: schema.users.id })
        if (!user) throw new Error(`Failed to create ${name}`)
        return user.id
      }

      const insertDue = async (
        owner: string,
        type: NotificationTopic,
        scheduledAt: Date,
        count: number
      ) => {
        const inserted = await db
          .insert(schema.notifications)
          .values(
            Arr.makeBy(count, () => ({
              type,
              title: 'Title',
              body: 'Body',
              userId: owner,
              scheduledAt,
            }))
          )
          .returning({ id: schema.notifications.id })
        return Arr.map(inserted, (row) => row.id)
      }

      const rowsOf = (ids: ReadonlyArray<string>) =>
        db
          .select({
            status: schema.notifications.status,
            scheduledAt: schema.notifications.scheduledAt,
          })
          .from(schema.notifications)
          .where(inArray(schema.notifications.id, [...ids]))

      it('moves DND rows to the DND end so the due row behind them is claimed on the second poll', async () => {
        const now = new Date()
        const dndUserId = await insertUser('dnd_user', {
          doNotDisturb: true,
          timezone: 'Asia/Kolkata',
          doNotDisturbStart: kolkataClock(
            new Date(now.getTime() - 60 * 60_000)
          ),
          doNotDisturbEnd: kolkataClock(new Date(now.getTime() + 60 * 60_000)),
        })
        const dndEnd = floorToMinute(new Date(now.getTime() + 60 * 60_000))
        const deferredIds = await insertDue(
          dndUserId,
          'watering_reminder',
          minutesAgo(10),
          BATCH_SIZE + 50
        )
        const [dueId] = await insertDue(
          userId,
          'watering_reminder',
          minutesAgo(1),
          1
        )

        const enqueued: QueueMessage[] = []
        await poll(enqueued)
        await poll(enqueued)

        expect(Arr.flatMap(enqueued, (m) => m.payload.notificationIds)).toEqual(
          [dueId]
        )
        const deferred = await rowsOf(deferredIds)
        expect(deferred).toHaveLength(BATCH_SIZE + 50)
        expect(
          new Set(
            Arr.map(
              deferred,
              (row) => `${row.status}@${row.scheduledAt.toISOString()}`
            )
          )
        ).toEqual(new Set([`pending@${dndEnd.toISOString()}`]))
      })

      it('moves each DND user to their own DND end and sends the user outside DND', async () => {
        const now = new Date()
        const inMinutes = (minutes: number) =>
          new Date(now.getTime() + minutes * 60_000)
        const dueFor = async (name: string, endsIn: number) =>
          insertDue(
            await insertUser(name, {
              doNotDisturb: true,
              timezone: 'Asia/Kolkata',
              doNotDisturbStart: kolkataClock(inMinutes(-60)),
              doNotDisturbEnd: kolkataClock(inMinutes(endsIn)),
            }),
            'watering_reminder',
            minutesAgo(10),
            1
          )
        const firstIds = await dueFor('dnd_first', 60)
        const secondIds = await dueFor('dnd_second', 90)
        const dueIds = await insertDue(
          userId,
          'watering_reminder',
          minutesAgo(1),
          1
        )

        const enqueued: QueueMessage[] = []
        await poll(enqueued)

        expect(Arr.flatMap(enqueued, (m) => m.payload.notificationIds)).toEqual(
          dueIds
        )
        expect(await rowsOf(firstIds)).toEqual([
          { status: 'pending', scheduledAt: floorToMinute(inMinutes(60)) },
        ])
        expect(await rowsOf(secondIds)).toEqual([
          { status: 'pending', scheduledAt: floorToMinute(inMinutes(90)) },
        ])
      })

      it('claims the row behind a fully deferred batch on the drain cooldown, not the interval', async () => {
        const now = new Date()
        const dndUserId = await insertUser('drain_dnd_user', {
          doNotDisturb: true,
          timezone: 'Asia/Kolkata',
          doNotDisturbStart: kolkataClock(
            new Date(now.getTime() - 60 * 60_000)
          ),
          doNotDisturbEnd: kolkataClock(new Date(now.getTime() + 60 * 60_000)),
        })
        await insertDue(
          dndUserId,
          'watering_reminder',
          minutesAgo(10),
          BATCH_SIZE
        )
        const [dueId] = await insertDue(
          userId,
          'watering_reminder',
          minutesAgo(1),
          1
        )

        const firstEnqueue = Promise.withResolvers<QueueMessage>()
        const message = await Effect.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              yield* createDrainableScheduler({
                name: 'drain-test',
                interval: '1 hour',
                runOnStartup: false,
                task: pollAndEnqueue,
              })
              return yield* Effect.promise(() => firstEnqueue.promise).pipe(
                Effect.timeout('10 seconds')
              )
            })
          ).pipe(
            Effect.provide(
              Layer.merge(
                RepositoriesLive,
                createMockMessageQueue({
                  onEnqueue: (_topic: NotificationTopic, queued) =>
                    firstEnqueue.resolve(queued),
                })
              )
            ),
            Effect.provideService(References.MinimumLogLevel, 'None')
          )
        )

        expect(message.payload.notificationIds).toEqual([dueId])
      }, 20_000)

      it('moves a vacation care row to the vacation end and sends a social row at once', async () => {
        const vacationEnd = new Date(Date.now() + 2 * 24 * 60 * 60_000)
        const vacationUserId = await insertUser('vacation_user', {
          vacationStatus: 'active',
          vacationStart: minutesAgo(24 * 60),
          vacationEnd,
        })
        const [careId = ''] = await insertDue(
          vacationUserId,
          'watering_reminder',
          minutesAgo(5),
          1
        )
        const [socialId] = await insertDue(
          vacationUserId,
          'new_follower',
          minutesAgo(5),
          1
        )

        const enqueued: QueueMessage[] = []
        await poll(enqueued)

        expect(Arr.flatMap(enqueued, (m) => m.payload.notificationIds)).toEqual(
          [socialId]
        )
        expect(await rowsOf([careId])).toEqual([
          { status: 'pending', scheduledAt: vacationEnd },
        ])
      })

      it('retries a care row on the vacation interval when the active vacation has no future end', async () => {
        const vacationRow = async (name: string, vacationEnd: Date | null) => {
          const owner = await insertUser(name, {
            vacationStatus: 'active',
            vacationStart: minutesAgo(24 * 60),
            vacationEnd,
          })
          const [id = ''] = await insertDue(
            owner,
            'watering_reminder',
            minutesAgo(5),
            1
          )
          return id
        }
        const ids = [
          await vacationRow('open_vacation_user', null),
          await vacationRow('overdue_vacation_user', minutesAgo(1)),
        ]

        const before = Date.now()
        const enqueued: QueueMessage[] = []
        await poll(enqueued)
        const after = Date.now()

        expect(enqueued).toEqual([])
        const rows = await rowsOf(ids)
        expect(rows).toHaveLength(2)
        for (const row of rows) {
          expect(row.status).toBe('pending')
          expect(row.scheduledAt.getTime()).toBeGreaterThanOrEqual(
            before + 5 * 60_000
          )
          expect(row.scheduledAt.getTime()).toBeLessThanOrEqual(
            after + 5 * 60_000
          )
        }
      })

      it('reads an unparseable stored DND end as the default end and still sends the rest of the batch', async () => {
        const now = new Date()
        const garbageUserId = await insertUser('garbage_dnd_user', {
          doNotDisturb: true,
          timezone: etcZoneWithLocalHour(23, now),
          doNotDisturbStart: '22:00',
          doNotDisturbEnd: '9999999999:00',
        })
        const [garbageId = ''] = await insertDue(
          garbageUserId,
          'watering_reminder',
          minutesAgo(10),
          1
        )
        const dueIds = await insertDue(
          userId,
          'watering_reminder',
          minutesAgo(1),
          3
        )

        const enqueued: QueueMessage[] = []
        await poll(enqueued)

        const sent = Arr.flatMap(enqueued, (m) => m.payload.notificationIds)
        expect(sent).toHaveLength(dueIds.length)
        expect(new Set(sent)).toEqual(new Set(dueIds))
        expect(await rowsOf([garbageId])).toEqual([
          {
            status: 'pending',
            scheduledAt: new Date(floorToHour(now).getTime() + 8 * 3_600_000),
          },
        ])
      })

      it('moves only queued rows that no delivery claimed', async () => {
        const original = minutesAgo(5)
        const until = new Date(Date.now() + 24 * 60 * 60_000)
        const insertRow = async (
          status: 'pending' | 'queued' | 'sent',
          deliveryMessageId: string | null
        ) => {
          const [row] = await db
            .insert(schema.notifications)
            .values({
              type: 'watering_reminder',
              title: 'Water',
              body: 'Water your plant',
              userId,
              scheduledAt: original,
              status,
              queuedAt: status === 'pending' ? null : minutesAgo(1),
              deliveryMessageId,
            })
            .returning({ id: schema.notifications.id })
          if (!row) throw new Error(`Failed to insert a ${status} row`)
          return row.id
        }
        const sentId = await insertRow('sent', 'msg-sent')
        const claimedId = await insertRow('queued', 'msg-claimed')
        const pendingId = await insertRow('pending', null)
        const queuedId = await insertRow('queued', null)

        await withRepo((repo) =>
          repo.deferUntil(
            Arr.map([sentId, claimedId, pendingId, queuedId], (id) => ({
              id,
              until,
            })),
            Option.none()
          )
        )

        expect(await rowsOf([sentId])).toEqual([
          { status: 'sent', scheduledAt: original },
        ])
        expect(await rowsOf([claimedId])).toEqual([
          { status: 'queued', scheduledAt: original },
        ])
        expect(await rowsOf([pendingId])).toEqual([
          { status: 'pending', scheduledAt: original },
        ])
        expect(await rowsOf([queuedId])).toEqual([
          { status: 'pending', scheduledAt: until },
        ])
      })
      it('moves rows held by the given message and releases their claim', async () => {
        const original = minutesAgo(5)
        const until = new Date(Date.now() + 60 * 60_000)
        const insertQueued = async (deliveryMessageId: string | null) => {
          const [row] = await db
            .insert(schema.notifications)
            .values({
              type: 'resubscribe_nudge',
              title: 'Come back',
              body: 'Your plants miss you',
              userId,
              scheduledAt: original,
              status: 'queued',
              queuedAt: minutesAgo(1),
              deliveryMessageId,
            })
            .returning({ id: schema.notifications.id })
          if (!row) throw new Error('Failed to insert a queued row')
          return row.id
        }
        const heldId = await insertQueued('msg-mine')
        const otherId = await insertQueued('msg-other')
        const unclaimedId = await insertQueued(null)

        await withRepo((repo) =>
          repo.deferUntil(
            Arr.map([heldId, otherId, unclaimedId], (id) => ({ id, until })),
            Option.some('msg-mine')
          )
        )

        const claimsOf = (ids: ReadonlyArray<string>) =>
          db
            .select({
              status: schema.notifications.status,
              scheduledAt: schema.notifications.scheduledAt,
              deliveryMessageId: schema.notifications.deliveryMessageId,
            })
            .from(schema.notifications)
            .where(inArray(schema.notifications.id, [...ids]))
        expect(await claimsOf([heldId])).toEqual([
          { status: 'pending', scheduledAt: until, deliveryMessageId: null },
        ])
        expect(await claimsOf([otherId])).toEqual([
          {
            status: 'queued',
            scheduledAt: original,
            deliveryMessageId: 'msg-other',
          },
        ])
        expect(await claimsOf([unclaimedId])).toEqual([
          { status: 'queued', scheduledAt: original, deliveryMessageId: null },
        ])
      })
    })

    describe('retryLater', () => {
      const firstRetry = new Date('2030-01-01T00:01:00.000Z')
      const secondRetry = new Date('2030-01-01T00:05:00.000Z')

      const attemptsOf = (ids: ReadonlyArray<string>) =>
        db
          .select({
            id: schema.notifications.id,
            status: schema.notifications.status,
            retryCount: schema.notifications.retryCount,
            scheduledAt: schema.notifications.scheduledAt,
            queuedAt: schema.notifications.queuedAt,
            deliveryMessageId: schema.notifications.deliveryMessageId,
            lastError: schema.notifications.lastError,
          })
          .from(schema.notifications)
          .where(inArray(schema.notifications.id, [...ids]))
          .orderBy(schema.notifications.id)

      const holdAgain = (id: string, messageId: string) =>
        db
          .update(schema.notifications)
          .set({
            status: 'queued',
            queuedAt: new Date(),
            deliveryMessageId: messageId,
          })
          .where(eq(schema.notifications.id, id))

      const retry = (ids: ReadonlyArray<string>, heldBy: string) =>
        withRepo((repo) =>
          repo.retryLater(ids, heldBy, [firstRetry, secondRetry], 'push down')
        )

      it('moves every row the message holds back to pending at the first retry time', async () => {
        const queuedAt = minutesAgo(1)
        const held = await insertRows(
          Arr.makeBy(3, () => ({
            status: 'queued' as const,
            queuedAt,
            deliveryMessageId: 'msg-mine',
          }))
        )
        const [other, unclaimed] = await insertRows([
          { status: 'queued', queuedAt, deliveryMessageId: 'msg-other' },
          { status: 'queued', queuedAt },
        ])
        if (!other || !unclaimed) throw new Error('seed failed')
        const [before] = await attemptsOf([other])

        const attempts = await retry([...held, other, unclaimed], 'msg-mine')

        expect(
          Arr.sort(
            Arr.map(attempts, (a) => a.id),
            Str.Order
          )
        ).toEqual(Arr.sort(held, Str.Order))
        expect(
          Arr.every(
            attempts,
            (a) => a.status === 'pending' && a.retryCount === 1
          )
        ).toBe(true)
        expect(await attemptsOf(held)).toEqual(
          Arr.map(Arr.sort(held, Str.Order), (id) => ({
            id,
            status: 'pending',
            retryCount: 1,
            scheduledAt: firstRetry,
            queuedAt: null,
            deliveryMessageId: null,
            lastError: 'push down',
          }))
        )
        expect(await attemptsOf([other])).toEqual([before])
        expect(await statusesOf([unclaimed])).toEqual(['queued'])
      })

      it('waits the second delay after the second failure and fails the row at the third', async () => {
        const [id] = await insertRows([
          {
            status: 'queued',
            queuedAt: minutesAgo(1),
            deliveryMessageId: 'msg-1',
          },
        ])
        if (!id) throw new Error('seed failed')

        await retry([id], 'msg-1')
        await holdAgain(id, 'msg-2')
        await retry([id], 'msg-2')
        expect(await attemptsOf([id])).toEqual([
          expect.objectContaining({
            status: 'pending',
            retryCount: 2,
            scheduledAt: secondRetry,
          }),
        ])

        await holdAgain(id, 'msg-3')
        const third = await retry([id], 'msg-3')

        expect(third).toEqual([{ id, status: 'failed', retryCount: 3 }])
        expect(await attemptsOf([id])).toEqual([
          expect.objectContaining({
            status: 'failed',
            retryCount: 3,
            scheduledAt: secondRetry,
            deliveryMessageId: 'msg-3',
            lastError: 'push down',
          }),
        ])
      })

      it('moves only the queued row among the rows the message holds', async () => {
        const queuedAt = minutesAgo(1)
        const [queued, ...left] = await insertRows([
          { status: 'queued', queuedAt, deliveryMessageId: 'msg-mine' },
          { status: 'sent', queuedAt, deliveryMessageId: 'msg-mine' },
          { status: 'failed', queuedAt, deliveryMessageId: 'msg-mine' },
          { status: 'pending', queuedAt, deliveryMessageId: 'msg-mine' },
        ])
        if (!queued) throw new Error('seed failed')
        const before = await attemptsOf(left)

        const attempts = await retry([queued, ...left], 'msg-mine')

        expect(attempts).toEqual([
          { id: queued, status: 'pending', retryCount: 1 },
        ])
        expect(await attemptsOf(left)).toEqual(before)
      })

      it('never fails a row another message holds', async () => {
        const [id] = await insertRows([
          {
            status: 'queued',
            queuedAt: minutesAgo(1),
            deliveryMessageId: 'msg-other',
          },
        ])
        if (!id) throw new Error('seed failed')
        await db
          .update(schema.notifications)
          .set({ retryCount: 2 })
          .where(eq(schema.notifications.id, id))

        const attempts = await retry([id], 'msg-mine')

        expect(attempts).toEqual([])
        expect(await attemptsOf([id])).toEqual([
          expect.objectContaining({
            status: 'queued',
            retryCount: 2,
            deliveryMessageId: 'msg-other',
          }),
        ])
      })
    })

    describe('findActiveActivitiesByUserId', () => {
      const insertDevice = async () => {
        const [device] = await db
          .insert(schema.deviceTokens)
          .values({
            token: `expo-${crypto.randomUUID()}`,
            platform: 'ios',
            userId,
          })
          .returning()
        if (!device) throw new Error('Failed to create device token')
        return device.id
      }

      it('returns the running activity of every device', async () => {
        const secondDevice = await insertDevice()
        const endedDevice = await insertDevice()
        await db.insert(schema.activityPushTokens).values([
          {
            userId,
            deviceTokenId,
            kind: 'update',
            activityId: 'activity-phone',
            token: 'update-phone',
            status: 'active',
          },
          {
            userId,
            deviceTokenId: secondDevice,
            kind: 'update',
            activityId: 'activity-second-phone',
            token: 'update-second-phone',
            status: 'active',
          },
          {
            userId,
            deviceTokenId: endedDevice,
            kind: 'update',
            activityId: 'activity-ended',
            token: 'update-ended',
            status: 'ended',
          },
          {
            userId,
            deviceTokenId,
            kind: 'start',
            token: 'start-phone',
            status: 'active',
          },
        ])

        const activities = await run(
          Effect.flatMap(ActivityPushTokenRepository, (repo) =>
            repo.findActiveActivitiesByUserId(userId)
          )
        )

        expect(Arr.map(activities, (a) => a.token).sort()).toEqual([
          'update-phone',
          'update-second-phone',
        ])
      })

      it("returns only the requested user's cards, never another user's", async () => {
        const [other] = await db
          .insert(schema.users)
          .values({
            email: `claims-other-${Date.now()}@example.com`,
            name: 'claims_other_user',
            emailVerified: true,
            role: 'user',
            status: 'active',
          })
          .returning()
        if (!other) throw new Error('Failed to create the other user')
        const [otherDevice] = await db
          .insert(schema.deviceTokens)
          .values({
            token: `expo-${crypto.randomUUID()}`,
            platform: 'ios',
            userId: other.id,
          })
          .returning()
        if (!otherDevice) throw new Error('Failed to create device token')
        await db.insert(schema.activityPushTokens).values([
          {
            userId,
            deviceTokenId,
            kind: 'update',
            activityId: 'activity-mine',
            token: 'update-mine',
            status: 'active',
          },
          {
            userId: other.id,
            deviceTokenId: otherDevice.id,
            kind: 'update',
            activityId: 'activity-other',
            token: 'update-other',
            status: 'active',
          },
        ])

        const activities = await run(
          Effect.flatMap(ActivityPushTokenRepository, (repo) =>
            repo.findActiveActivitiesByUserId(userId)
          )
        )

        expect(Arr.map(activities, (a) => a.token)).toEqual(['update-mine'])
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
