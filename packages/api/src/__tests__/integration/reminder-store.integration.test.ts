import { careDayOf } from '@lily/api/__tests__/integration/care-rows'
import { waitsForALock } from '@lily/api/__tests__/integration/lock-waits'
import { transactInMemory } from '@lily/api/__tests__/mocks/transaction'
import { CareReadsLive } from '@lily/api/contexts/care'
import {
  Change,
  linesOf,
  type ReminderRow,
} from '@lily/api/contexts/reminders/domain/plan'
import { replan } from '@lily/api/contexts/reminders/replan'
import {
  apply,
  Dirty,
  load,
  type StoreContext,
} from '@lily/api/contexts/reminders/store'
import type { Transaction } from '@lily/api/kernel/transact'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import {
  NotificationRepository,
  NotificationRepositoryLive,
} from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { CareDay, CareDays } from '@lily/shared'
import { asc, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import {
  Array,
  DateTime,
  Deferred,
  Effect,
  Exit,
  Layer,
  Option,
  pipe,
  References,
} from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const StoreLive = Layer.mergeAll(
  CareReadsLive,
  CanopyRepositoryLive,
  NotificationRepositoryLive,
  PlantRepositoryLive,
  UserRepositoryLive,
  DelegationRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const run = <A, E>(effect: Effect.Effect<A, E, StoreContext | Transaction>) =>
  Effect.runPromise(
    effect.pipe(
      transactInMemory,
      Effect.provide(StoreLive),
      Effect.provideService(References.MinimumLogLevel, 'None')
    )
  )

const DAY_MS = 86_400_000
const NOBODY = '00000000-0000-4000-8000-000000000000'

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Reminder store - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let alex: string
    let lily: string
    let sam: string
    let shared: string
    let personal: string
    let dueDay: CareDay

    const user = async (name: string, timezone: string, time: string) => {
      const [row] = await db
        .insert(schema.users)
        .values({
          email: `${name.toLowerCase()}-${Date.now()}@example.com`,
          name: `${name} ${Date.now()}`,
          emailVerified: true,
          role: 'user',
          status: 'active',
          timezone,
          preferredNotificationTime: time,
        })
        .returning()
      if (!row) throw new Error(`Failed to create ${name}`)
      return row.id
    }

    const plant = async (
      owner: { userId: string } | { canopyId: string },
      name: string,
      dueAt: Date
    ) => {
      const [row] = await db
        .insert(schema.plants)
        .values({
          ...owner,
          createdByUserId: alex,
          name,
          health: 'HEALTHY',
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
        })
        .returning()
      if (!row) throw new Error(`Failed to create plant ${name}`)
      await db.insert(schema.plantCareSchedules).values({
        plantId: row.id,
        careType: 'watering',
        frequencyDays: 7,
        nextCareAt: dueAt,
        dueDay: careDayOf(dueAt),
      })
      return row.id
    }

    const seed = async (
      values: Partial<typeof schema.notifications.$inferInsert> & {
        userId: string
      }
    ) => {
      const [row] = await db
        .insert(schema.notifications)
        .values({
          type: 'watering_reminder',
          scheduledAt: new Date(Date.now() + DAY_MS),
          plantId: shared,
          status: 'pending',
          ...values,
        })
        .returning()
      if (!row) throw new Error('Failed to seed a notification')
      return row.id
    }

    const stored = () =>
      db
        .select({
          id: schema.notifications.id,
          userId: schema.notifications.userId,
          plantId: schema.notifications.plantId,
          type: schema.notifications.type,
          status: schema.notifications.status,
          scheduledAt: schema.notifications.scheduledAt,
          occasionDay: schema.notifications.occasionDay,
          metadata: schema.notifications.metadata,
        })
        .from(schema.notifications)
        .orderBy(asc(schema.notifications.createdAt))

    const sendTime = (day: CareDay, timezone: string, hour: number) =>
      DateTime.add(CareDays.startOf(day, timezone), { hours: hour })

    const put = (userId: string, scheduledAt: DateTime.Utc) =>
      Change.Put({
        userId,
        plantId: shared,
        type: 'watering_reminder',
        occasion: dueDay,
        scheduledAt,
      })

    const retime = (userId: string, scheduledAt: DateTime.Utc, rowId: string) =>
      Change.Retime({ rowId, userId, occasion: dueDay, scheduledAt })

    const drop = (rowId: string, userId: string) =>
      Change.Remove({ rowId, userId, why: 'superseded' })

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      for (const table of [
        'notifications',
        'plant_care_schedules',
        'plants',
        'canopy_plant_mutes',
        'canopy_members',
        'canopies',
        'users',
      ]) {
        await db.execute(
          sql.raw(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`)
        )
      }
      alex = await user('Alex', 'UTC', '09:00')
      lily = await user('Lily', 'Pacific/Auckland', '08:00')
      sam = await user('Sam', 'UTC', '09:00')
      const [canopy] = await db
        .insert(schema.canopies)
        .values({ name: 'Flat', timezone: 'UTC' })
        .returning()
      if (!canopy) throw new Error('Failed to create canopy')
      await db.insert(schema.canopyMembers).values([
        { canopyId: canopy.id, userId: alex, role: 'owner' },
        { canopyId: canopy.id, userId: lily, role: 'member' },
      ])
      const inThreeDays = new Date(Date.now() + 3 * DAY_MS)
      dueDay = CareDays.of(DateTime.makeUnsafe(inThreeDays), 'UTC')
      shared = await plant({ canopyId: canopy.id }, 'Shared Fern', inThreeDays)
      personal = await plant({ userId: sam }, 'Sam Pothos', inThreeDays)
    })

    beforeEach(async () => {
      await db.execute(
        sql`TRUNCATE TABLE notifications RESTART IDENTITY CASCADE`
      )
    })

    afterAll(async () => {
      await pool.end()
    })

    describe('load', () => {
      it('reads the plant, its audience, the due day from Care and each recipient send time', async () => {
        const loaded = await run(load([shared, personal]))
        const fern = Array.findFirst(loaded.plants, (p) => p.id === shared)

        expect(
          Option.map(fern, (p) => ({
            living: p.life._tag === 'Living',
            remindersEnabled: p.remindersEnabled,
            audience: [...p.audience].sort(),
            lines: Array.map(linesOf(p), (l) => [
              l.careType,
              l.dueDay,
              l.status._tag,
            ]),
            rows: p.rows,
          }))
        ).toEqual(
          Option.some({
            living: true,
            remindersEnabled: true,
            audience: [alex, lily].sort(),
            lines: [['watering', dueDay, 'Upcoming']],
            rows: [],
          })
        )
        const sendTimeOf = (userId: string) =>
          pipe(
            Option.fromNullishOr(loaded.recipients.get(userId)),
            Option.flatMap((r) =>
              Option.fromNullishOr(r.sendTimes.get(dueDay))
            ),
            Option.map(DateTime.formatIso),
            Option.getOrNull
          )
        expect(sendTimeOf(alex)).toBe(
          DateTime.formatIso(sendTime(dueDay, 'UTC', 9))
        )
        expect(sendTimeOf(lily)).toBe(
          DateTime.formatIso(sendTime(dueDay, 'Pacific/Auckland', 8))
        )
        expect(sendTimeOf(sam)).toBe(
          DateTime.formatIso(sendTime(dueDay, 'UTC', 9))
        )
      })

      it('gives a dead plant no lines and marks it dead', async () => {
        await db.execute(
          sql`UPDATE plants SET died_at = now() WHERE id = ${personal}`
        )
        const loaded = await run(load([personal])).finally(() =>
          db.execute(
            sql`UPDATE plants SET died_at = NULL WHERE id = ${personal}`
          )
        )
        expect(
          Array.map(loaded.plants, (p) => [
            p.life._tag === 'Living',
            linesOf(p).length,
          ])
        ).toEqual([[false, 0]])
      })

      it('reads the rows of the five reminder types with their delivery state and occasion', async () => {
        const yesterday = new Date(Date.now() - DAY_MS)
        const marked = await seed({ userId: alex, occasionDay: dueDay })
        const unmarked = await seed({ userId: lily })
        const retrying = await seed({
          userId: lily,
          type: 'overdue_reminder',
          retryCount: 2,
        })
        const queued = await seed({ userId: alex, status: 'queued' })
        const inFlight = await seed({
          userId: alex,
          status: 'queued',
          deliveryMessageId: 'message-1',
        })
        const sentForDueDay = await seed({
          userId: sam,
          status: 'sent',
          sentAt: new Date(Date.now() - 30 * DAY_MS),
          scheduledAt: new Date(Date.now() - 30 * DAY_MS),
          occasionDay: dueDay,
        })
        await seed({
          userId: sam,
          status: 'sent',
          sentAt: yesterday,
          scheduledAt: yesterday,
        })
        await seed({
          userId: sam,
          status: 'sent',
          sentAt: new Date(Date.now() - 30 * DAY_MS),
          scheduledAt: new Date(Date.now() - 30 * DAY_MS),
        })
        await seed({
          userId: sam,
          status: 'failed',
          scheduledAt: new Date(Date.now() - 30 * DAY_MS),
          occasionDay: CareDay.make('2020-01-01'),
        })
        await seed({ userId: alex, type: 'canopy_member_joined' })

        const loaded = await run(load([shared]))
        const rows = pipe(
          loaded.plants,
          Array.flatMap((p) => p.rows),
          Array.map((r: ReminderRow) => [
            r.id,
            r.delivery._tag,
            r.type === 'overdue_reminder' ? null : Option.getOrNull(r.dueDay),
          ])
        )

        expect(rows).toHaveLength(6)
        expect(rows).toEqual(
          expect.arrayContaining([
            [marked, 'Pending', dueDay],
            [unmarked, 'Pending', null],
            [retrying, 'Pending', null],
            [queued, 'Queued', null],
            [inFlight, 'InFlight', null],
            [sentForDueDay, 'Sent', dueDay],
          ])
        )
        expect(
          pipe(
            loaded.plants,
            Array.flatMap((p) => p.rows),
            Array.findFirst((r) => r.id === retrying),
            Option.map((r) => r.delivery)
          )
        ).toEqual(Option.some({ _tag: 'Pending', retrying: true }))
      })

      it('holds the waiting rows until its transaction ends, and leaves a row in flight free', async () => {
        const waiting = await seed({ userId: alex })
        const inFlight = await seed({
          userId: alex,
          status: 'queued',
          deliveryMessageId: 'message-1',
        })
        const free = (id: string) =>
          Effect.promise(() =>
            pool.query(
              'SELECT id FROM notifications WHERE id = $1 FOR UPDATE SKIP LOCKED',
              [id]
            )
          ).pipe(Effect.map((result) => result.rowCount === 1))

        const during = await run(
          Effect.flatMap(SqlClient.SqlClient, (client) =>
            client.withTransaction(
              Effect.andThen(
                load([shared]),
                Effect.all([free(waiting), free(inFlight)])
              )
            )
          )
        )
        const after = await Effect.runPromise(free(waiting))

        expect(during).toEqual([false, true])
        expect(after).toBe(true)
      })

      it('never waits for an owner change: no unique index of plants holds an owner column, so the change takes NO KEY UPDATE', async () => {
        const { rows } = await pool.query(
          `SELECT indexname FROM pg_indexes
           WHERE schemaname = current_schema()
             AND tablename = 'plants'
             AND indexdef LIKE 'CREATE UNIQUE INDEX%'
             AND indexdef ~ '\\m(user_id|canopy_id)\\M'`
        )

        expect(rows).toEqual([])
      })
    })

    describe('apply', () => {
      it('writes a new pending row with the day it is about', async () => {
        const at = sendTime(dueDay, 'UTC', 9)
        await run(apply([put(alex, at)]))

        expect(await stored()).toEqual([
          {
            id: expect.any(String),
            userId: alex,
            plantId: shared,
            type: 'watering_reminder',
            status: 'pending',
            scheduledAt: DateTime.toDateUtc(at),
            occasionDay: dueDay,
            metadata: {},
          },
        ])
      })

      it('re-times a pending row in place: same id, new time, occasion recorded', async () => {
        const existing = await seed({ userId: alex })
        const at = sendTime(dueDay, 'UTC', 11)
        await run(apply([retime(alex, at, existing)]))

        expect(
          Array.map(await stored(), (r) => [
            r.id,
            r.scheduledAt.toISOString(),
            r.occasionDay,
          ])
        ).toEqual([[existing, DateTime.formatIso(at), dueDay]])
      })

      it('leaves a row alone once delivery has it: retried, queued or sent', async () => {
        const before = new Date(Date.now() + DAY_MS)
        const retried = await seed({
          userId: alex,
          retryCount: 1,
          scheduledAt: before,
        })
        const queued = await seed({
          userId: lily,
          status: 'queued',
          scheduledAt: before,
        })
        const sent = await seed({
          userId: sam,
          status: 'sent',
          scheduledAt: before,
        })
        const at = sendTime(dueDay, 'UTC', 11)
        await run(
          apply([
            retime(alex, at, retried),
            retime(lily, at, queued),
            retime(sam, at, sent),
          ])
        )

        expect(
          Array.map(await stored(), (r) => [
            r.id,
            r.scheduledAt.toISOString(),
            r.occasionDay,
          ])
        ).toEqual(
          Array.map([retried, queued, sent], (id) => [
            id,
            before.toISOString(),
            null,
          ])
        )
      })

      it('writes no second row for an occasion the slot already carries, whatever its status', async () => {
        const sent = await seed({
          userId: alex,
          status: 'sent',
          sentAt: new Date(),
          occasionDay: dueDay,
        })
        await run(
          apply([
            put(alex, sendTime(dueDay, 'UTC', 9)),
            put(lily, sendTime(dueDay, 'UTC', 9)),
          ])
        )

        expect(Array.map(await stored(), (r) => [r.userId, r.status])).toEqual([
          [alex, 'sent'],
          [lily, 'pending'],
        ])
        expect(Array.map(await stored(), (r) => r.id)).toContain(sent)
      })

      it('leaves one row when two writers plan the same occasion at once without the keys', async () => {
        const firstWrote = Deferred.makeUnsafe<void>()
        const letFirstCommit = Deferred.makeUnsafe<void>()
        const early = sendTime(dueDay, 'UTC', 9)
        const late = sendTime(dueDay, 'UTC', 11)
        const first = run(
          Effect.flatMap(SqlClient.SqlClient, (client) =>
            client.withTransaction(
              apply([put(alex, early)]).pipe(
                Effect.andThen(Deferred.succeed(firstWrote, undefined)),
                Effect.andThen(Deferred.await(letFirstCommit))
              )
            )
          )
        )
        await Effect.runPromise(Deferred.await(firstWrote))
        const second = run(apply([put(alex, late)]))
        await waitsForALock(pool, second)
        Deferred.doneUnsafe(letFirstCommit, Exit.void)
        await Promise.all([first, second])

        expect(
          Array.map(await stored(), (r) => [
            r.userId,
            r.status,
            r.scheduledAt.toISOString(),
          ])
        ).toEqual([[alex, 'pending', DateTime.formatIso(late)]])
      })

      it('re-times the pending row a planner did not know of, and no row delivery has', async () => {
        const before = new Date(Date.now() + DAY_MS)
        const standing = { occasionDay: dueDay, scheduledAt: before }
        const unseen = await seed({ userId: alex, ...standing })
        const retried = await seed({ userId: lily, retryCount: 1, ...standing })
        const sent = await seed({ userId: sam, status: 'sent', ...standing })
        const queued = await seed({
          userId: alex,
          type: 'misting_reminder',
          status: 'queued',
          ...standing,
        })
        const at = sendTime(dueDay, 'UTC', 11)
        await run(
          apply([
            put(alex, at),
            put(lily, at),
            put(sam, at),
            Change.Put({ ...put(alex, at), type: 'misting_reminder' }),
          ])
        )

        expect(
          Array.map(await stored(), (r) => [r.id, r.scheduledAt.toISOString()])
        ).toEqual([
          [unseen, DateTime.formatIso(at)],
          [retried, before.toISOString()],
          [sent, before.toISOString()],
          [queued, before.toISOString()],
        ])
      })

      it('lets delivery release a queued row back to pending next to a newer pending row', async () => {
        const earlier = CareDays.addDays(dueDay, -7)
        const queued = await seed({
          userId: alex,
          status: 'queued',
          queuedAt: new Date(),
          occasionDay: earlier,
        })
        await run(apply([put(alex, sendTime(dueDay, 'UTC', 9))]))

        await run(
          Effect.flatMap(NotificationRepository, (repo) =>
            repo.releaseUnclaimed([queued])
          )
        )

        expect(
          Array.map(await stored(), (r) => [r.status, r.occasionDay])
        ).toEqual([
          ['pending', earlier],
          ['pending', dueDay],
        ])
      })

      it('removes pending and queued rows and never a row in flight', async () => {
        const pending = await seed({ userId: alex })
        const queued = await seed({ userId: alex, status: 'queued' })
        const inFlight = await seed({
          userId: alex,
          status: 'queued',
          deliveryMessageId: 'message-1',
        })
        const sent = await seed({ userId: alex, status: 'sent' })
        await run(
          apply(
            Array.map([pending, queued, inFlight, sent], (id) => drop(id, alex))
          )
        )

        expect(Array.map(await stored(), (r) => r.id)).toEqual([inFlight, sent])
      })

      it('is atomic: a write that fails keeps the rows the same call removed', async () => {
        const old = await seed({ userId: alex })
        const exit = await Effect.runPromiseExit(
          apply([
            drop(old, alex),
            put(NOBODY, sendTime(dueDay, 'UTC', 9)),
          ]).pipe(
            transactInMemory,
            Effect.provide(StoreLive),
            Effect.provideService(References.MinimumLogLevel, 'None')
          )
        )

        expect(exit._tag).toBe('Failure')
        expect(Array.map(await stored(), (r) => r.id)).toEqual([old])
      })
    })

    describe('replan', () => {
      const snapshot = async () =>
        Array.map(await stored(), (r) => [
          r.id,
          r.userId,
          r.plantId,
          r.scheduledAt.toISOString(),
          r.occasionDay,
        ])

      it('writes one row per recipient at their send time, and a second run changes nothing', async () => {
        await run(replan(Dirty.Plants({ plantIds: [shared, personal] })))
        const first = await snapshot()
        await run(replan(Dirty.Plants({ plantIds: [shared, personal] })))

        expect(await snapshot()).toEqual(first)
        expect(
          Array.map(first, ([, userId, plantId, at, day]) => [
            userId,
            plantId,
            at,
            day,
          ]).sort()
        ).toEqual(
          [
            [
              alex,
              shared,
              DateTime.formatIso(sendTime(dueDay, 'UTC', 9)),
              dueDay,
            ],
            [
              lily,
              shared,
              DateTime.formatIso(sendTime(dueDay, 'Pacific/Auckland', 8)),
              dueDay,
            ],
            [
              sam,
              personal,
              DateTime.formatIso(sendTime(dueDay, 'UTC', 9)),
              dueDay,
            ],
          ].sort()
        )
      })

      it('moves a row to the new send time without replacing it', async () => {
        await run(replan(Dirty.Plants({ plantIds: [personal] })))
        const [before] = await snapshot()
        await db.execute(
          sql`UPDATE users SET preferred_notification_time = '11:00' WHERE id = ${sam}`
        )
        await run(replan(Dirty.Plants({ plantIds: [personal] }))).finally(() =>
          db.execute(
            sql`UPDATE users SET preferred_notification_time = '09:00' WHERE id = ${sam}`
          )
        )

        expect(await snapshot()).toEqual([
          [
            before?.[0],
            sam,
            personal,
            DateTime.formatIso(sendTime(dueDay, 'UTC', 11)),
            dueDay,
          ],
        ])
      })

      it('plans a canopy for everyone and a recipient for that user only', async () => {
        const [membership] = await db
          .select({ canopyId: schema.canopyMembers.canopyId })
          .from(schema.canopyMembers)
          .limit(1)
        if (!membership) throw new Error('no canopy')
        await run(replan(Dirty.Recipient({ userId: lily })))
        expect(Array.map(await snapshot(), ([, userId]) => userId)).toEqual([
          lily,
        ])

        await run(replan(Dirty.Canopy({ canopyId: membership.canopyId })))
        expect(
          Array.map(await snapshot(), ([, userId, plantId]) => [
            userId,
            plantId,
          ]).sort()
        ).toEqual(
          [
            [alex, shared],
            [lily, shared],
          ].sort()
        )
      })

      it('leaves another member row alone when one recipient is replanned', async () => {
        const stale = await seed({
          userId: alex,
          occasionDay: dueDay,
          scheduledAt: new Date(Date.now() + DAY_MS),
        })
        const before = await snapshot()
        await run(replan(Dirty.Recipient({ userId: lily })))

        expect(Array.filter(await snapshot(), ([id]) => id === stale)).toEqual(
          before
        )
      })

      it('writes a personal plant whole when the recipient replanned is the one who stopped tending it', async () => {
        await seed({ userId: alex, plantId: personal, occasionDay: dueDay })

        await run(replan(Dirty.Recipient({ userId: alex })))

        expect(
          Array.filter(
            await snapshot(),
            ([, , plantId]) => plantId === personal
          ).map(([, userId, , at]) => [userId, at])
        ).toEqual([[sam, DateTime.formatIso(sendTime(dueDay, 'UTC', 9))]])
      })
    })
  }
)
