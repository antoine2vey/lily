import { careDayOf } from '@lily/api/__tests__/integration/care-rows'
import {
  CareLogRepository,
  CareLogRepositoryLive,
} from '@lily/api/repositories/care-log.repository'
import {
  EngagementRepository,
  EngagementRepositoryLive,
} from '@lily/api/repositories/engagement.repository'
import { resolveTimezone } from '@lily/api/services/helpers/resolve-timezone'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, Effect, Layer } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const AppLive = Layer.mergeAll(
  CareLogRepositoryLive,
  EngagementRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const run = <A, E>(
  effect: Effect.Effect<A, E, Layer.Success<typeof AppLive>>
) => Effect.runPromise(Effect.provide(effect, AppLive))

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000)

// An alias of Europe/Dublin from the IANA `backward` file. JavaScript accepts
// it, and postgres-ssl:17, which ships no tzdata-legacy, rejects it.
const ALIAS = 'Eire'

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'A user stored with a time zone alias - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let userId: string
    let timezone: string
    let plantId: string

    const careOn = (days: ReadonlyArray<number>) =>
      db.insert(schema.careLogs).values(
        Array.map(days, (d) => {
          const date = daysAgo(d)
          return {
            plantId,
            type: 'watering' as const,
            date,
            careDay: careDayOf(date),
            performedByUserId: userId,
          }
        })
      )

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    beforeEach(async () => {
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `alias-${Date.now()}@example.com`,
          emailVerified: true,
          timezone: ALIAS,
        })
        .returning()
      if (!user) throw new Error('user insert returned nothing')
      userId = user.id
      timezone = resolveTimezone(user.timezone)
      const [plant] = await db
        .insert(schema.plants)
        .values({
          name: 'Monstera',
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
          userId,
          createdByUserId: userId,
        })
        .returning({ id: schema.plants.id })
      if (!plant) throw new Error('plant insert returned nothing')
      plantId = plant.id
    })

    afterAll(async () => {
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      await pool.end()
    })

    it("counts the week's care for the weekly recap", async () => {
      await careOn([0, 8])

      const count = await run(
        Effect.flatMap(EngagementRepository, (repo) =>
          repo.getCareLogsCountForWeek(userId, timezone)
        )
      )

      expect(count).toBe(1)
    })

    it("counts today's care", async () => {
      await careOn([0, 2])

      const counts = await run(
        Effect.gen(function* () {
          const repo = yield* CareLogRepository
          return {
            held: yield* repo.countTodayByUser(userId, timezone, null),
            performed: yield* repo.countTodayPerformedByUser(userId, timezone),
          }
        })
      )

      expect(counts).toEqual({ held: 1, performed: 1 })
    })
  }
)
