import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { careDayOf } from '@lily/api/__tests__/integration/care-rows'
import {
  sessionsWaitingForALock,
  sleepsBetweenAttempts,
} from '@lily/api/__tests__/integration/lock-waits'
import { CareReadsLive } from '@lily/api/contexts/care'
import { replanPlants } from '@lily/api/contexts/reminders'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { type CareDay, CareDays } from '@lily/shared'
import { asc, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, DateTime, Effect, Layer, Record, References } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

const migrationPath = fileURLToPath(
  new URL(
    '../../../../db/drizzle/0084_reminder_occasion_backfill.sql',
    import.meta.url
  )
)

const StoreLive = Layer.mergeAll(
  CareReadsLive,
  CanopyRepositoryLive,
  NotificationRepositoryLive,
  PlantRepositoryLive,
  UserRepositoryLive,
  DelegationRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

const CARE_ZONE = 'Pacific/Kiritimati'
const RECIPIENT_ZONE = 'Etc/GMT+12'
const SEND_HOUR = 21

type Seed = Partial<typeof schema.notifications.$inferInsert>

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  '0084 reminder occasion backfill - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let alex: string
    let canopyId: string
    const rows: Record<string, string> = {}
    const plants: Record<string, string> = {}

    const now = new Date()
    const today = careDayOf(now, CARE_ZONE)
    const inThreeDays = CareDays.addDays(today, 3)
    const threeDaysAgo = CareDays.addDays(today, -3)
    const yesterdayEveningUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
        4 * HOUR_MS
    )
    const sendTime = (day: CareDay) =>
      DateTime.toDateUtc(
        DateTime.add(CareDays.startOf(day, RECIPIENT_ZONE), {
          hours: SEND_HOUR,
        })
      )
    const sent = (at: Date): Seed => ({
      status: 'sent',
      scheduledAt: at,
      sentAt: at,
    })

    const user = async (name: string, timezone: string) => {
      const [row] = await db
        .insert(schema.users)
        .values({
          email: `${name}-${Date.now()}@example.com`,
          name,
          emailVerified: true,
          timezone,
          preferredNotificationTime: `${SEND_HOUR}:00`,
        })
        .returning({ id: schema.users.id })
      if (!row) throw new Error(`Failed to create ${name}`)
      return row.id
    }

    const plant = async (
      name: string,
      dueDay: CareDay,
      owner?: { userId: string }
    ) => {
      const [row] = await db
        .insert(schema.plants)
        .values({
          ...(owner ?? { canopyId }),
          createdByUserId: alex,
          name,
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
        })
        .returning({ id: schema.plants.id })
      if (!row) throw new Error(`Failed to create plant ${name}`)
      await db.insert(schema.plantCareSchedules).values({
        plantId: row.id,
        careType: 'watering',
        frequencyDays: 7,
        nextCareAt: DateTime.toDateUtc(CareDays.startOf(dueDay, CARE_ZONE)),
        dueDay,
      })
      plants[name] = row.id
      return row.id
    }

    const reminder = async (
      name: string,
      plantId: string,
      values: Seed,
      userId = alex
    ) => {
      const [row] = await db
        .insert(schema.notifications)
        .values({
          type: 'watering_reminder',
          scheduledAt: now,
          status: 'pending',
          ...values,
          plantId,
          userId,
        })
        .returning({ id: schema.notifications.id })
      if (!row) throw new Error(`Failed to seed ${name}`)
      rows[name] = row.id
    }

    const stored = () =>
      db
        .select({
          id: schema.notifications.id,
          status: schema.notifications.status,
          scheduledAt: schema.notifications.scheduledAt,
          occasionDay: schema.notifications.occasionDay,
        })
        .from(schema.notifications)
        .orderBy(asc(schema.notifications.id))

    const occasionOf = async () => {
      const dayById = new Map(
        Array.map(await stored(), (row) => [row.id, row.occasionDay])
      )
      return Record.map(rows, (id) => dayById.get(id))
    }

    const backfill = async (beforeCommit?: () => Promise<void>) => {
      const migration = await readFile(migrationPath, 'utf8')
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(migration)
        await beforeCommit?.()
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    }

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
      alex = await user('alex', RECIPIENT_ZONE)
      const kiri = await user('kiri', CARE_ZONE)
      const lost = await user('lost', 'Not/AZone')
      const [canopy] = await db
        .insert(schema.canopies)
        .values({ name: 'Flat', timezone: CARE_ZONE })
        .returning({ id: schema.canopies.id })
      if (!canopy) throw new Error('Failed to create canopy')
      canopyId = canopy.id
      await db
        .insert(schema.canopyMembers)
        .values({ canopyId, userId: alex, role: 'owner' })

      await reminder('waiting', await plant('waiting', inThreeDays), {
        scheduledAt: sendTime(inThreeDays),
      })

      const handedToAWorker = await plant('queued', inThreeDays)
      await reminder('queued', handedToAWorker, { status: 'queued' })
      await reminder('waiting beside the queued one', handedToAWorker, {
        scheduledAt: sendTime(inThreeDays),
        occasionDay: inThreeDays,
      })

      await reminder('sent today', await plant('sent today', today), sent(now))

      const owned = await plant('owned', threeDaysAgo, { userId: kiri })
      await reminder('sent yesterday', owned, sent(yesterdayEveningUtc), kiri)
      await reminder(
        'sent long ago',
        owned,
        sent(new Date(now.getTime() - 30 * DAY_MS)),
        kiri
      )

      const twice = await plant('delivered twice', threeDaysAgo)
      await reminder('delivered twice, sent', twice, sent(yesterdayEveningUtc))
      await reminder('delivered twice, failed', twice, {
        status: 'failed',
        scheduledAt: yesterdayEveningUtc,
      })

      const announced = await plant('announced', today)
      await reminder('still waiting once sent', announced, {
        scheduledAt: sendTime(today),
      })
      await reminder('sent beside a waiting one', announced, sent(now))

      const held = await plant('day held', inThreeDays)
      await reminder('holds the day', held, {
        scheduledAt: sendTime(inThreeDays),
        occasionDay: inThreeDays,
      })
      await reminder('waiting for a held day', held, {
        scheduledAt: new Date(sendTime(inThreeDays).getTime() - HOUR_MS),
      })

      const dead = await plant('dead', today)
      await db.execute(
        sql`UPDATE plants SET died_at = now() WHERE id = ${dead}`
      )
      await reminder('of a dead plant', dead, sent(now))

      await reminder('overdue reminder', await plant('overdue', threeDaysAgo), {
        ...sent(now),
        type: 'overdue_reminder',
      })

      await reminder(
        'unknown timezone',
        await plant('adrift', threeDaysAgo, { userId: lost }),
        sent(yesterdayEveningUtc),
        lost
      )

      await backfill()
    })

    afterAll(async () => {
      await pool.end()
    })

    it('gives a pending row the stored due day and any other recent row the care day of its instant', async () => {
      const inCareZone = careDayOf(yesterdayEveningUtc, CARE_ZONE)
      expect(inCareZone).not.toBe(careDayOf(yesterdayEveningUtc, 'UTC'))

      expect(await occasionOf()).toMatchObject({
        waiting: inThreeDays,
        queued: today,
        'sent today': today,
        'sent yesterday': inCareZone,
        'sent long ago': null,
        'of a dead plant': null,
        'overdue reminder': null,
        'unknown timezone': careDayOf(yesterdayEveningUtc, 'UTC'),
      })
    })

    it('gives a day to one row only where several would take it, a delivered row before a waiting one', async () => {
      const occasion = await occasionOf()

      expect(
        Array.filter(
          [
            occasion['delivered twice, sent'],
            occasion['delivered twice, failed'],
          ],
          (day) => day !== null
        )
      ).toEqual([careDayOf(yesterdayEveningUtc, CARE_ZONE)])
      expect(occasion).toMatchObject({
        'sent beside a waiting one': today,
        'still waiting once sent': null,
        'holds the day': inThreeDays,
        'waiting for a held day': null,
      })
    })

    it('changes nothing on a second run', async () => {
      const before = await stored()
      await backfill()
      expect(await stored()).toEqual(before)
    })

    it('waits for a session that holds a reminder row, then holds writers and row lockers off until it commits', async () => {
      const before = await stored()
      const lockARow = 'SELECT id FROM notifications WHERE id = $1 FOR UPDATE'
      const rowHolder = await pool.connect()
      await rowHolder.query('BEGIN')
      await rowHolder.query(lockARow, [rows.waiting])

      const held: Array<Promise<unknown>> = []
      let waiting = 0
      const run = backfill(async () => {
        held.push(
          pool.query(
            'UPDATE notifications SET is_read = is_read WHERE id = $1',
            [rows.waiting]
          ),
          pool.query(lockARow, [rows.queued])
        )
        waiting = await sessionsWaitingForALock(pool, held.length)
      })
      const retried = await sleepsBetweenAttempts(pool)
      await rowHolder.query('COMMIT')
      rowHolder.release()
      await run
      await Promise.all(held)

      expect(retried).toBe(true)
      expect(waiting).toBe(2)
      expect(await stored()).toEqual(before)
    }, 15_000)

    it('leaves planning nothing to do but remove the waiting rows left without a day', async () => {
      const before = await stored()
      const leftovers = [
        rows['still waiting once sent'],
        rows['waiting for a held day'],
      ]

      const changes = await Effect.runPromise(
        replanPlants(
          Array.filter(Record.values(plants), (id) => id !== plants.adrift)
        ).pipe(
          Effect.provide(StoreLive),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      expect(changes).toBe(leftovers.length)
      expect(await stored()).toEqual(
        Array.filter(before, (row) => !Array.contains(leftovers, row.id))
      )
    })
  }
)
