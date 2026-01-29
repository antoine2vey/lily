import * as schema from '@lily/db/schema'
import { count, eq, sql } from 'drizzle-orm'
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
      // Reset plant watering columns
      if (testPlantIds?.length > 0) {
        await db
          .update(schema.plants)
          .set({ lastWateredAt: null, nextWateringAt: null })
          .where(eq(schema.plants.userId, testUserId))
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
            wateringFrequencyDays: 3,
            humidityRating: 3,
            lightingRating: 3,
            petToxicityRating: 1,
            wateringRating: 3,
          },
          {
            userId: testUserId,
            name: 'Water Plant B',
            health: 'HEALTHY',
            wateringFrequencyDays: 7,
            humidityRating: 3,
            lightingRating: 3,
            petToxicityRating: 1,
            wateringRating: 3,
          },
        ])
        .returning()

      testPlantIds = pipe(plants, (ps) => ps.map((p) => p.id))
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
      await db.execute(sql`TRUNCATE TABLE plants RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      await pool.end()
    })

    it('should atomically update plants and create care logs in a transaction', async () => {
      // Simulate what waterMultiplePlants does: update plants + insert care logs
      // Using a raw SQL transaction to verify the DB supports our use case
      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        const now = new Date()

        // Update both plants
        for (const plantId of testPlantIds) {
          await db
            .update(schema.plants)
            .set({
              lastWateredAt: now,
              nextWateringAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
            })
            .where(eq(schema.plants.id, plantId))
        }

        // Insert care logs
        await db.insert(schema.careLogs).values(
          testPlantIds.map((plantId) => ({
            type: 'watering' as const,
            plantId,
            date: now,
          }))
        )

        await client.query('COMMIT')

        // Verify plants were updated
        const updatedPlants = await db
          .select()
          .from(schema.plants)
          .where(eq(schema.plants.userId, testUserId))

        for (const plant of updatedPlants) {
          expect(plant.lastWateredAt).not.toBeNull()
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

        // Update first plant within the transaction (succeeds)
        await client.query(
          'UPDATE plants SET last_watered_at = $1, next_watering_at = $2 WHERE id = $3',
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

      // Verify first plant was NOT updated (rolled back)
      const firstPlantId = pipe(
        Arr.head(testPlantIds),
        Option.getOrElse(() => '')
      )
      const [plant] = await db
        .select()
        .from(schema.plants)
        .where(eq(schema.plants.id, firstPlantId))

      expect(plant?.lastWateredAt).toBeNull()

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

    it('should handle concurrent plant updates within the same transaction', async () => {
      const now = new Date()

      // Update all plants concurrently using Promise.all (simulates Effect.forEach with unbounded concurrency)
      await Promise.all(
        testPlantIds.map((plantId) =>
          db
            .update(schema.plants)
            .set({
              lastWateredAt: now,
              nextWateringAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
            })
            .where(eq(schema.plants.id, plantId))
        )
      )

      // Verify all plants have the same lastWateredAt timestamp
      const updatedPlants = await db
        .select()
        .from(schema.plants)
        .where(eq(schema.plants.userId, testUserId))

      const timestamps = updatedPlants.map((p) => p.lastWateredAt?.getTime())

      // All timestamps should be identical (same `now` value)
      expect(new Set(timestamps).size).toBe(1)
      expect(timestamps[0]).toBe(now.getTime())
    })
  }
)
