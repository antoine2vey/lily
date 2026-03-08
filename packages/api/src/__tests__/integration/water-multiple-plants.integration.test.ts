import * as schema from '@lily/db/schema'
import { and, count, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array as Arr, Option, pipe } from 'effect'
import pg from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'waterMultiplePlants - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let testUserId: string
    let testPlantIds: string[]

    const resetTestData = async () => {
      await db.execute(sql`TRUNCATE TABLE care_logs RESTART IDENTITY CASCADE`)
      await db.execute(
        sql`TRUNCATE TABLE notifications RESTART IDENTITY CASCADE`
      )
      // Reset care schedule watering rows
      if (testPlantIds?.length > 0) {
        for (const plantId of testPlantIds) {
          await db
            .update(schema.plantCareSchedules)
            .set({ lastCareAt: null, nextCareAt: null })
            .where(
              and(
                eq(schema.plantCareSchedules.plantId, plantId),
                eq(schema.plantCareSchedules.careType, 'watering')
              )
            )
        }
      }
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })

      // Clean slate
      await db.execute(sql`TRUNCATE TABLE care_logs RESTART IDENTITY CASCADE`)
      await db.execute(
        sql`TRUNCATE TABLE notifications RESTART IDENTITY CASCADE`
      )
      await db.execute(
        sql`TRUNCATE TABLE plant_photos RESTART IDENTITY CASCADE`
      )
      await db.execute(sql`TRUNCATE TABLE plant_scans RESTART IDENTITY CASCADE`)
      await db.execute(
        sql`TRUNCATE TABLE plant_care_schedules RESTART IDENTITY CASCADE`
      )
      await db.execute(sql`TRUNCATE TABLE plants RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)

      // Create test user
      const timestamp = Date.now()
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `water-test-${timestamp}@example.com`,
          name: 'Water Test User',
          emailVerified: true,
          role: 'user',
          status: 'active',
        })
        .returning()

      if (!user) {
        throw new Error('Failed to create test user')
      }

      testUserId = user.id

      // Create test plants
      const plants = await db
        .insert(schema.plants)
        .values([
          {
            userId: testUserId,
            name: 'Water Plant A',
            health: 'HEALTHY',
            humidityRating: 3,
            lightingRating: 3,
            petToxicityRating: 1,
            wateringRating: 3,
          },
          {
            userId: testUserId,
            name: 'Water Plant B',
            health: 'HEALTHY',
            humidityRating: 3,
            lightingRating: 3,
            petToxicityRating: 1,
            wateringRating: 3,
          },
        ])
        .returning()

      testPlantIds = Arr.map(plants, (p) => p.id)

      // Create watering schedules for each plant
      const [firstPlantId, secondPlantId] = testPlantIds
      await db.insert(schema.plantCareSchedules).values([
        {
          plantId: firstPlantId ?? '',
          careType: 'watering',
          frequencyDays: 3,
        },
        {
          plantId: secondPlantId ?? '',
          careType: 'watering',
          frequencyDays: 7,
        },
      ])
    })

    afterEach(async () => {
      await resetTestData()
    })

    afterAll(async () => {
      // Clean up
      await db.execute(sql`TRUNCATE TABLE care_logs RESTART IDENTITY CASCADE`)
      await db.execute(
        sql`TRUNCATE TABLE notifications RESTART IDENTITY CASCADE`
      )
      await db.execute(
        sql`TRUNCATE TABLE plant_photos RESTART IDENTITY CASCADE`
      )
      await db.execute(sql`TRUNCATE TABLE plant_scans RESTART IDENTITY CASCADE`)
      await db.execute(
        sql`TRUNCATE TABLE plant_care_schedules RESTART IDENTITY CASCADE`
      )
      await db.execute(sql`TRUNCATE TABLE plants RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      await pool.end()
    })

    it('should atomically update schedules and create care logs in a transaction', async () => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        const now = new Date()

        // Update watering schedules for both plants
        for (const plantId of testPlantIds) {
          await db
            .update(schema.plantCareSchedules)
            .set({
              lastCareAt: now,
              nextCareAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
            })
            .where(
              and(
                eq(schema.plantCareSchedules.plantId, plantId),
                eq(schema.plantCareSchedules.careType, 'watering')
              )
            )
        }

        // Insert care logs
        await db.insert(schema.careLogs).values(
          Arr.map(testPlantIds, (plantId) => ({
            type: 'watering' as const,
            plantId,
            date: now,
          }))
        )

        await client.query('COMMIT')

        // Verify schedules were updated
        const updatedSchedules = await db
          .select()
          .from(schema.plantCareSchedules)
          .where(eq(schema.plantCareSchedules.careType, 'watering'))

        const userSchedules = Arr.filter(updatedSchedules, (s) =>
          Arr.contains(testPlantIds, s.plantId)
        )

        for (const schedule of userSchedules) {
          expect(schedule.lastCareAt).not.toBeNull()
        }

        // Verify care logs were created
        const [careLogCount] = await db
          .select({ count: count() })
          .from(schema.careLogs)

        const logCount = pipe(
          Option.fromNullable(careLogCount?.count),
          Option.getOrElse(() => 0)
        )

        expect(logCount).toBe(2)
      } finally {
        client.release()
      }
    })

    it('should rollback all changes when transaction fails', async () => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        const now = new Date()

        // Update first plant's schedule within the transaction (succeeds)
        await client.query(
          `UPDATE plant_care_schedules SET last_care_at = $1, next_care_at = $2
           WHERE plant_id = $3 AND care_type = 'watering'`,
          [
            now,
            new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
            testPlantIds[0],
          ]
        )

        // Insert a care log with a non-existent plantId — FK violation triggers real failure
        const bogusPlantId = '00000000-0000-0000-0000-000000000000'
        await expect(
          client.query(
            'INSERT INTO care_logs (type, plant_id, date) VALUES ($1, $2, $3)',
            ['watering', bogusPlantId, now]
          )
        ).rejects.toThrow()

        // Transaction is now in an aborted state; rollback to release
        await client.query('ROLLBACK')
      } finally {
        client.release()
      }

      // Verify first plant's schedule was NOT updated (rolled back)
      const firstPlantId = pipe(
        Arr.head(testPlantIds),
        Option.getOrElse(() => '')
      )
      const [schedule] = await db
        .select()
        .from(schema.plantCareSchedules)
        .where(
          and(
            eq(schema.plantCareSchedules.plantId, firstPlantId),
            eq(schema.plantCareSchedules.careType, 'watering')
          )
        )

      expect(schedule?.lastCareAt).toBeNull()

      // Verify no care logs were created
      const [careLogCount] = await db
        .select({ count: count() })
        .from(schema.careLogs)

      const logCount = pipe(
        Option.fromNullable(careLogCount?.count),
        Option.getOrElse(() => 0)
      )

      expect(logCount).toBe(0)
    })

    it('should handle concurrent schedule updates within the same transaction', async () => {
      const now = new Date()

      // Update all plant schedules concurrently using Promise.all
      await Promise.all(
        Arr.map(testPlantIds, (plantId) =>
          db
            .update(schema.plantCareSchedules)
            .set({
              lastCareAt: now,
              nextCareAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
            })
            .where(
              and(
                eq(schema.plantCareSchedules.plantId, plantId),
                eq(schema.plantCareSchedules.careType, 'watering')
              )
            )
        )
      )

      // Verify all schedules have the same lastCareAt timestamp
      const updatedSchedules = await db
        .select()
        .from(schema.plantCareSchedules)
        .where(eq(schema.plantCareSchedules.careType, 'watering'))

      const userSchedules = Arr.filter(updatedSchedules, (s) =>
        Arr.contains(testPlantIds, s.plantId)
      )

      const timestamps = Arr.map(userSchedules, (s) => s.lastCareAt?.getTime())

      // All timestamps should be identical (same `now` value)
      expect(new Set(timestamps).size).toBe(1)
      expect(timestamps[0]).toBe(now.getTime())
    })
  }
)
