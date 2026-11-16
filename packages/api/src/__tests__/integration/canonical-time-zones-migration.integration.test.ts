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
    let paris: string
    let elsewhere: string
    let traveller: string

    const parisEvening = new Date('2026-11-10T21:00:00Z')
    const parisDue = new Date('2026-11-17T21:00:00Z')
    const kolkataNight = new Date('2026-11-10T20:00:00Z')

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
          createdByUserId: traveller,
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

    const careRows = async () => ({
      careLogs: await db
        .select()
        .from(schema.careLogs)
        .orderBy(asc(schema.careLogs.id)),
      schedules: await db
        .select()
        .from(schema.plantCareSchedules)
        .orderBy(asc(schema.plantCareSchedules.id)),
    })

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
      traveller = await user(`paris-${Date.now()}@example.com`, 'Asia/Calcutta')
      eire = await user(`eire-${Date.now()}@example.com`, 'Eire')
      paris = await user(`fr-${Date.now()}@example.com`, 'Europe/Paris')
      elsewhere = await user(`mars-${Date.now()}@example.com`, 'Mars/Base')
      const [canopy] = await db
        .insert(schema.canopies)
        .values({ name: 'Flat', timezone: 'Asia/Calcutta' })
        .returning({ id: schema.canopies.id })
      if (!canopy) throw new Error('Failed to create canopy')
      const bonsai = await plant('Bonsai', { userId: traveller })
      const palm = await plant('Palm', { canopyId: canopy.id })
      await db.insert(schema.careLogs).values([
        {
          plantId: bonsai,
          type: 'watering',
          date: parisEvening,
          careDay: careDayOf(parisEvening, 'Europe/Paris'),
          performedByUserId: traveller,
        },
        {
          plantId: palm,
          type: 'watering',
          date: kolkataNight,
          careDay: careDayOf(kolkataNight),
          performedByUserId: traveller,
        },
      ])
      await db.insert(schema.plantCareSchedules).values({
        plantId: bonsai,
        careType: 'watering',
        frequencyDays: 7,
        nextCareAt: parisDue,
        dueDay: careDayOf(parisDue, 'Europe/Paris'),
      })
    })

    afterAll(async () => {
      await db.execute(
        sql`TRUNCATE TABLE users, canopies RESTART IDENTITY CASCADE`
      )
      await pool.end()
    })

    it('stores the zone each alias names and leaves other zones alone', async () => {
      await migrate()

      expect(await zones()).toEqual({
        users: {
          [traveller]: 'Asia/Kolkata',
          [eire]: 'Europe/Dublin',
          [paris]: 'Europe/Paris',
          [elsewhere]: 'Mars/Base',
        },
        canopy: 'Asia/Kolkata',
      })
    })

    it('leaves every care day and due day of an alias owner as stored', async () => {
      const before = await careRows()

      await migrate()

      expect(await careRows()).toEqual(before)
      expect(before.careLogs).toContainEqual(
        expect.objectContaining({ date: parisEvening, careDay: '2026-11-10' })
      )
      expect(before.schedules).toContainEqual(
        expect.objectContaining({ nextCareAt: parisDue, dueDay: '2026-11-17' })
      )
    })

    it('changes nothing when it runs again', async () => {
      await migrate()
      const once = { zones: await zones(), careRows: await careRows() }

      await migrate()

      expect({ zones: await zones(), careRows: await careRows() }).toEqual(once)
    })
  }
)
