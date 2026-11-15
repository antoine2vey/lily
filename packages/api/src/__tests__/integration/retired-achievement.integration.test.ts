import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import {
  AchievementRepository,
  AchievementRepositoryLive,
} from '@lily/api/repositories/achievement.repository'
import { getUserAchievements } from '@lily/api/services/achievements/endpoints/get-user-achievements'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, Effect, Layer } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const AppLive = AchievementRepositoryLive.pipe(
  Layer.provideMerge(DrizzleLive),
  Layer.provideMerge(PgLive)
)

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'A user who holds the retired RARE_COLLECTOR row - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let userId: string

    beforeAll(() => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    beforeEach(async () => {
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `rare-${Date.now()}@example.com`,
          name: 'Rare Holder',
          emailVerified: true,
        })
        .returning()
      if (!user) throw new Error('user insert returned nothing')
      userId = user.id
      await db.execute(sql`
        INSERT INTO user_achievements (user_id, achievement)
        VALUES (${userId}, 'FIRST_PLANT_ADDED'), (${userId}, 'RARE_COLLECTOR')
      `)
    })

    afterAll(async () => {
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      await pool.end()
    })

    it('lists only live achievements and counts only live unlocks', async () => {
      const response = await Effect.runPromise(
        getUserAchievements().pipe(
          Effect.provide(
            Layer.merge(AppLive, createMockCurrentUser({ id: userId }))
          )
        )
      )

      expect(Array.map(response.achievements, (a) => a.key)).not.toContain(
        'RARE_COLLECTOR'
      )
      expect(response.totalCount).toBe(14)
      expect(response.unlockedCount).toBe(1)
      expect(
        Array.map(
          Array.filter(response.achievements, (a) => a.unlocked),
          (a) => a.key
        )
      ).toEqual(['FIRST_PLANT_ADDED'])
    })

    it('leaves the retired row out of the stored achievements it reads', async () => {
      const rows = await Effect.runPromise(
        Effect.flatMap(AchievementRepository, (repo) =>
          repo.findByUserId(userId)
        ).pipe(Effect.provide(AppLive))
      )

      expect(Array.map(rows, (row) => row.achievement)).toEqual([
        'FIRST_PLANT_ADDED',
      ])
    })

    it('leaves the retired row out of the admin achievement count', async () => {
      const count = await Effect.runPromise(
        Effect.flatMap(AchievementRepository, (repo) =>
          repo.countByUserId(userId)
        ).pipe(Effect.provide(AppLive))
      )

      expect(count).toBe(1)
    })
  }
)
