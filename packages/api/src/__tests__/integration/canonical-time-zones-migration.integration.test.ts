import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { careDayOf } from '@lily/api/__tests__/integration/care-rows'
import * as schema from '@lily/db/schema'
import { TIME_ZONE_ALIASES } from '@lily/shared'
import { asc, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, Record } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const migrationPath = fileURLToPath(
  new URL(
    '../../../../db/drizzle/0089_canonical_time_zones.sql',
    import.meta.url
  )
)

const PAIR = /^\s+\('([^']+)', '([^']+)'\)[,;]$/

describe('0089 canonical time zones', () => {
  it('rewrites exactly the aliases of the generated table', async () => {
    const pairs = Array.flatMap(
      (await readFile(migrationPath, 'utf8')).split('\n'),
      (line) => {
        const match = PAIR.exec(line)
        return match?.[1] && match[2] ? [[match[1], match[2]] as const] : []
      }
    )

    expect(Record.fromEntries(pairs)).toEqual(TIME_ZONE_ALIASES)
    expect(pairs).toHaveLength(Record.size(TIME_ZONE_ALIASES))
  })
})

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  '0089 canonical time zones - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let eire: string
    let elsewhere: string
    let calcutta: string
    let fern: string
    let palm: string

    const evening = new Date('2026-07-02T23:30:00Z')
    const nextMorning = new Date('2026-07-03T12:00:00Z')
    const augustEvening = new Date('2026-08-05T23:15:00Z')
    const winterEvening = new Date('2026-01-10T23:30:00Z')
    const kolkataNight = new Date('2026-11-10T20:00:00Z')
    const dublinSummerMidnight = new Date('2027-06-14T23:00:00Z')
    const kolkataMidnight = new Date('2026-11-17T18:30:00Z')

    const migrate = async () => {
      const migration = await readFile(migrationPath, 'utf8')
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(migration)
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    }

    const user = async (email: string, timezone: string) => {
      const [row] = await db
        .insert(schema.users)
        .values({ email, emailVerified: true, timezone })
        .returning({ id: schema.users.id })
      if (!row) throw new Error(`Failed to create ${email}`)
      return row.id
    }

    const plant = async (
      name: string,
      owner: { userId: string } | { canopyId: string }
    ) => {
      const [row] = await db
        .insert(schema.plants)
        .values({
          ...owner,
          createdByUserId: eire,
          name,
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
        })
        .returning({ id: schema.plants.id })
      if (!row) throw new Error(`Failed to create plant ${name}`)
      return row.id
    }

    const careDays = async () =>
      Array.map(
        await db
          .select({
            date: schema.careLogs.date,
            careDay: schema.careLogs.careDay,
          })
          .from(schema.careLogs)
          .orderBy(asc(schema.careLogs.date)),
        ({ date, careDay }) => [date.toISOString(), careDay] as const
      )

    const dueDays = async () =>
      Array.map(
        await db
          .select({
            plantId: schema.plantCareSchedules.plantId,
            dueDay: schema.plantCareSchedules.dueDay,
          })
          .from(schema.plantCareSchedules),
        ({ plantId, dueDay }) => [plantId, dueDay] as const
      )

    const zones = async () => ({
      users: Record.fromEntries(
        Array.map(
          await db
            .select({
              id: schema.users.id,
              timezone: schema.users.timezone,
            })
            .from(schema.users),
          ({ id, timezone }) => [id, timezone] as const
        )
      ),
      canopy: (
        await db
          .select({ timezone: schema.canopies.timezone })
          .from(schema.canopies)
      )[0]?.timezone,
    })

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    beforeEach(async () => {
      await db.execute(
        sql`TRUNCATE TABLE users, canopies RESTART IDENTITY CASCADE`
      )
      eire = await user(`eire-${Date.now()}@example.com`, 'Eire')
      elsewhere = await user(`mars-${Date.now()}@example.com`, 'Mars/Base')
      const [canopy] = await db
        .insert(schema.canopies)
        .values({ name: 'Flat', timezone: 'Asia/Calcutta' })
        .returning({ id: schema.canopies.id })
      if (!canopy) throw new Error('Failed to create canopy')
      calcutta = canopy.id
      fern = await plant('Fern', { userId: eire })
      palm = await plant('Palm', { canopyId: calcutta })
      await db.insert(schema.careLogs).values(
        Array.map(
          [
            [fern, 'watering', evening],
            [fern, 'watering', nextMorning],
            [fern, 'watering', augustEvening],
            [fern, 'misting', winterEvening],
            [palm, 'watering', kolkataNight],
          ] as const,
          ([plantId, type, date]) => ({
            plantId,
            type,
            date,
            careDay: careDayOf(date),
            performedByUserId: eire,
          })
        )
      )
      await db.insert(schema.plantCareSchedules).values([
        {
          plantId: fern,
          careType: 'repotting',
          frequencyDays: 365,
          nextCareAt: dublinSummerMidnight,
          dueDay: careDayOf(dublinSummerMidnight),
        },
        {
          plantId: palm,
          careType: 'watering',
          frequencyDays: 7,
          nextCareAt: kolkataMidnight,
          dueDay: careDayOf(kolkataMidnight),
        },
      ])
    })

    afterAll(async () => {
      await db.execute(
        sql`TRUNCATE TABLE users, canopies RESTART IDENTITY CASCADE`
      )
      await pool.end()
    })

    it('stores the zone each alias names and leaves an unknown zone alone', async () => {
      await migrate()

      expect(await zones()).toEqual({
        users: { [eire]: 'Europe/Dublin', [elsewhere]: 'Mars/Base' },
        canopy: 'Asia/Kolkata',
      })
    })

    it('recomputes the day columns that UTC placed on the wrong day', async () => {
      await migrate()

      expect(await careDays()).toEqual(
        expect.arrayContaining([
          [winterEvening.toISOString(), '2026-01-10'],
          [nextMorning.toISOString(), '2026-07-03'],
          [augustEvening.toISOString(), '2026-08-06'],
          [kolkataNight.toISOString(), '2026-11-11'],
        ])
      )
      expect(Record.fromEntries(await dueDays())).toEqual({
        [fern]: '2027-06-15',
        [palm]: '2026-11-18',
      })
    })

    it('keeps a day that another log of the same care already holds', async () => {
      await migrate()

      expect(await careDays()).toContainEqual([
        evening.toISOString(),
        '2026-07-02',
      ])
    })

    it('moves a run of consecutive evenings back one day each', async () => {
      const buenosAires = await user(
        `ba-${Date.now()}@example.com`,
        'America/Buenos_Aires'
      )
      const monstera = await plant('Monstera', { userId: buenosAires })
      const evenings = Array.map(
        ['02', '03', '04', '05', '06'],
        (day) => new Date(`2026-09-${day}T00:30:00Z`)
      )
      await db.insert(schema.careLogs).values(
        Array.map(evenings, (date) => ({
          plantId: monstera,
          type: 'watering' as const,
          date,
          careDay: careDayOf(date),
          performedByUserId: buenosAires,
        }))
      )

      await migrate()

      expect(await careDays()).toEqual(
        expect.arrayContaining([
          ['2026-09-02T00:30:00.000Z', '2026-09-01'],
          ['2026-09-03T00:30:00.000Z', '2026-09-02'],
          ['2026-09-04T00:30:00.000Z', '2026-09-03'],
          ['2026-09-05T00:30:00.000Z', '2026-09-04'],
          ['2026-09-06T00:30:00.000Z', '2026-09-05'],
        ])
      )
    })

    it('moves a run of consecutive nights forward one day each', async () => {
      const nights = Array.map(
        ['20', '21', '22', '23', '24'],
        (day) => new Date(`2026-11-${day}T20:00:00Z`)
      )
      await db.insert(schema.careLogs).values(
        Array.map(nights, (date) => ({
          plantId: palm,
          type: 'misting' as const,
          date,
          careDay: careDayOf(date),
          performedByUserId: eire,
        }))
      )

      await migrate()

      expect(await careDays()).toEqual(
        expect.arrayContaining([
          ['2026-11-20T20:00:00.000Z', '2026-11-21'],
          ['2026-11-21T20:00:00.000Z', '2026-11-22'],
          ['2026-11-22T20:00:00.000Z', '2026-11-23'],
          ['2026-11-23T20:00:00.000Z', '2026-11-24'],
          ['2026-11-24T20:00:00.000Z', '2026-11-25'],
        ])
      )
    })

    it('changes nothing when it runs again', async () => {
      await migrate()
      const once = {
        zones: await zones(),
        careDays: await careDays(),
        dueDays: await dueDays(),
      }

      await migrate()

      expect({
        zones: await zones(),
        careDays: await careDays(),
        dueDays: await dueDays(),
      }).toEqual(once)
    })
  }
)
