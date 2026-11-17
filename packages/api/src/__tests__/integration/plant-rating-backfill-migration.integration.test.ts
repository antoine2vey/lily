import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { careDayOf } from '@lily/api/__tests__/integration/care-rows'
import * as schema from '@lily/db/schema'
import { wateringRatingFromFrequency } from '@lily/shared'
import { DEFAULT_HUMIDITY_RATING } from '@lily/shared/indoor-demand'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, Order, Record } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const migrationPath = fileURLToPath(
  new URL(
    '../../../../db/drizzle/0090_plant_rating_zero_backfill.sql',
    import.meta.url
  )
)

const UNDO = `
UPDATE plants p SET humidity_rating = a.old_value
FROM plant_rating_backfill a
WHERE a.plant_id = p.id AND a.rating = 'humidity' AND p.humidity_rating = a.new_value;
UPDATE plants p SET watering_rating = a.old_value
FROM plant_rating_backfill a
WHERE a.plant_id = p.id AND a.rating = 'watering' AND p.watering_rating = a.new_value;
`

const BEFORE_WATERING_FIELD = new Date('2026-03-01T12:00:00Z')
const SUMMER = new Date('2026-06-01T12:00:00Z')
const BEFORE_MCP_CREATE = new Date('2026-10-30T12:00:00Z')
const MCP_ERA = new Date('2026-11-10T12:00:00Z')
const AFTER_HUMIDITY_FIX = new Date('2026-11-17T16:20:00Z')
const AFTER_WATERING_FIX = new Date('2026-11-17T17:00:00Z')

type Creator = 'mcpLinked' | 'appOnly'

interface Case {
  readonly name: string
  readonly creator: Creator
  readonly dateAdded: Date
  readonly humidityRating: number
  readonly wateringRating: number
  readonly lightingRating: number
  readonly petToxicityRating: number
  readonly description?: string
  readonly wateringDays?: number
  readonly expected: { readonly humidity: number; readonly watering: number }
}

const mcpShape = {
  creator: 'mcpLinked',
  humidityRating: 0,
  wateringRating: 0,
  lightingRating: 50,
  petToxicityRating: 100,
  wateringDays: 4,
} as const

const BAND_DAYS = [1, 5, 6, 8, 9, 12, 13, 30] as const

const EVERY_9_DAYS =
  'created before the api took a watering rating, every 9 days'

const bandCases: ReadonlyArray<Case> = Array.map(BAND_DAYS, (days) => ({
  name: `created before the api took a watering rating, every ${days} days`,
  creator: 'appOnly',
  dateAdded: BEFORE_WATERING_FIELD,
  humidityRating: 50,
  wateringRating: 0,
  lightingRating: 50,
  petToxicityRating: 100,
  wateringDays: days,
  expected: { humidity: 50, watering: wateringRatingFromFrequency(days) },
}))

const predicateCases: ReadonlyArray<Case> = [
  {
    name: 'scanned with an AI pet rating, watering omitted',
    creator: 'appOnly',
    dateAdded: SUMMER,
    humidityRating: 60,
    wateringRating: 0,
    lightingRating: 70,
    petToxicityRating: 20,
    wateringDays: 7,
    expected: { humidity: 60, watering: wateringRatingFromFrequency(7) },
  },
  {
    name: 'scanned with a pet rating of 60 outside the 0087 names',
    creator: 'appOnly',
    dateAdded: SUMMER,
    humidityRating: 60,
    wateringRating: 0,
    lightingRating: 70,
    petToxicityRating: 60,
    wateringDays: 10,
    expected: { humidity: 60, watering: wateringRatingFromFrequency(10) },
  },
  {
    name: 'Pothos',
    creator: 'appOnly',
    dateAdded: SUMMER,
    humidityRating: 60,
    wateringRating: 0,
    lightingRating: 50,
    petToxicityRating: 60,
    wateringDays: 7,
    expected: { humidity: 60, watering: 0 },
  },
  {
    name: 'manual watering slider dragged to 0',
    creator: 'appOnly',
    dateAdded: SUMMER,
    humidityRating: 40,
    wateringRating: 0,
    lightingRating: 50,
    petToxicityRating: 0,
    wateringDays: 7,
    expected: { humidity: 40, watering: 0 },
  },
  {
    name: 'manual humidity slider dragged to 0',
    creator: 'mcpLinked',
    dateAdded: SUMMER,
    humidityRating: 0,
    wateringRating: 30,
    lightingRating: 50,
    petToxicityRating: 100,
    wateringDays: 7,
    expected: { humidity: 0, watering: 30 },
  },
  {
    name: 'created through MCP create_plant',
    ...mcpShape,
    dateAdded: MCP_ERA,
    expected: {
      humidity: DEFAULT_HUMIDITY_RATING,
      watering: wateringRatingFromFrequency(4),
    },
  },
  {
    name: 'MCP shaped, creator never linked MCP',
    ...mcpShape,
    creator: 'appOnly',
    dateAdded: MCP_ERA,
    expected: { humidity: 0, watering: 0 },
  },
  {
    name: 'MCP shaped with a description',
    ...mcpShape,
    dateAdded: MCP_ERA,
    description: 'Kitchen window',
    expected: { humidity: 0, watering: 0 },
  },
  {
    name: 'MCP shaped before create_plant shipped',
    ...mcpShape,
    dateAdded: BEFORE_MCP_CREATE,
    expected: { humidity: 0, watering: 0 },
  },
  {
    name: 'MCP shaped after the humidity fix',
    ...mcpShape,
    dateAdded: AFTER_HUMIDITY_FIX,
    expected: { humidity: 0, watering: 0 },
  },
  {
    name: 'scanned after the watering fix',
    creator: 'appOnly',
    dateAdded: AFTER_WATERING_FIX,
    humidityRating: 60,
    wateringRating: 0,
    lightingRating: 70,
    petToxicityRating: 20,
    wateringDays: 7,
    expected: { humidity: 60, watering: 0 },
  },
  {
    name: 'created before the api took a watering rating, no watering schedule',
    creator: 'appOnly',
    dateAdded: BEFORE_WATERING_FIELD,
    humidityRating: 50,
    wateringRating: 0,
    lightingRating: 50,
    petToxicityRating: 100,
    expected: { humidity: 50, watering: 0 },
  },
]

const cases = [...bandCases, ...predicateCases]

interface AuditRow {
  readonly plant: string
  readonly rating: 'humidity' | 'watering'
  readonly oldValue: number
  readonly newValue: number
}

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  '0090 plant rating zero backfill - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>

    const runSql = async (text: string) => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(text)
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    }

    const migrate = async () => runSql(await readFile(migrationPath, 'utf8'))

    const user = async (email: string) => {
      const [row] = await db
        .insert(schema.users)
        .values({ email, emailVerified: true })
        .returning({ id: schema.users.id })
      if (!row) throw new Error(`Failed to create ${email}`)
      return row.id
    }

    const ratings = async () =>
      Record.fromEntries(
        Array.map(
          await db
            .select({
              name: schema.plants.name,
              humidity: schema.plants.humidityRating,
              watering: schema.plants.wateringRating,
            })
            .from(schema.plants),
          ({ name, humidity, watering }) =>
            [name, { humidity, watering }] as const
        )
      )

    const byNameThenRating = Order.combine(
      Order.mapInput(Order.String, (row: AuditRow) => row.plant),
      Order.mapInput(Order.String, (row: AuditRow) => row.rating)
    )

    const audit = async () =>
      Array.sort(
        await db
          .select({
            plant: schema.plants.name,
            rating: schema.plantRatingBackfill.rating,
            oldValue: schema.plantRatingBackfill.oldValue,
            newValue: schema.plantRatingBackfill.newValue,
          })
          .from(schema.plantRatingBackfill)
          .innerJoin(
            schema.plants,
            eq(schema.plants.id, schema.plantRatingBackfill.plantId)
          ),
        byNameThenRating
      )

    const setWatering = (plant: string, wateringRating: number) =>
      db
        .update(schema.plants)
        .set({ wateringRating })
        .where(eq(schema.plants.name, plant))

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    beforeEach(async () => {
      await db.execute(
        sql`TRUNCATE TABLE users, canopies RESTART IDENTITY CASCADE`
      )
      const creators: Record<Creator, string> = {
        mcpLinked: await user(`mcp-${Date.now()}@example.com`),
        appOnly: await user(`app-${Date.now()}@example.com`),
      }
      await db.insert(schema.oauthUserApiCredentials).values({
        userId: creators.mcpLinked,
        apiJwt: 'jwt',
        apiRefreshToken: 'refresh',
      })

      for (const c of cases) {
        const [row] = await db
          .insert(schema.plants)
          .values({
            userId: creators[c.creator],
            createdByUserId: creators[c.creator],
            name: c.name,
            description: c.description,
            dateAdded: c.dateAdded,
            humidityRating: c.humidityRating,
            wateringRating: c.wateringRating,
            lightingRating: c.lightingRating,
            petToxicityRating: c.petToxicityRating,
          })
          .returning({ id: schema.plants.id })
        if (!row) throw new Error(`Failed to create plant ${c.name}`)
        if (c.wateringDays !== undefined) {
          await db.insert(schema.plantCareSchedules).values({
            plantId: row.id,
            careType: 'watering',
            frequencyDays: c.wateringDays,
            nextCareAt: c.dateAdded,
            dueDay: careDayOf(c.dateAdded),
          })
        }
      }
    })

    afterAll(async () => {
      await db.execute(
        sql`TRUNCATE TABLE users, canopies RESTART IDENTITY CASCADE`
      )
      await pool.end()
    })

    it('backfills only the omitted zeros, with the TypeScript values', async () => {
      await migrate()

      expect(await ratings()).toEqual(
        Record.fromEntries(
          Array.map(cases, (c) => [c.name, c.expected] as const)
        )
      )
    })

    it('records the old and new value of every rating it changes', async () => {
      await migrate()

      const changed = Array.flatMap(cases, (c) =>
        Array.filter(
          [
            {
              rating: 'humidity' as const,
              oldValue: c.humidityRating,
              newValue: c.expected.humidity,
            },
            {
              rating: 'watering' as const,
              oldValue: c.wateringRating,
              newValue: c.expected.watering,
            },
          ],
          ({ oldValue, newValue }) => oldValue !== newValue
        ).map((change) => ({ plant: c.name, ...change }))
      )

      expect(await audit()).toEqual(Array.sort(changed, byNameThenRating))
    })

    it('changes nothing when it runs again, even a 0 the user set since', async () => {
      await migrate()
      expect((await ratings())[EVERY_9_DAYS]?.watering).toBe(30)
      await setWatering(EVERY_9_DAYS, 0)
      const once = { ratings: await ratings(), audit: await audit() }

      await migrate()

      expect({ ratings: await ratings(), audit: await audit() }).toEqual(once)
      expect(once.ratings[EVERY_9_DAYS]?.watering).toBe(0)
    })

    it('undoes the backfill and keeps a rating the user changed since', async () => {
      const before = await ratings()
      await migrate()
      expect(await ratings()).not.toEqual(before)
      await setWatering(EVERY_9_DAYS, 80)

      await runSql(UNDO)

      expect(await ratings()).toEqual({
        ...before,
        [EVERY_9_DAYS]: { humidity: 50, watering: 80 },
      })
    })
  }
)
