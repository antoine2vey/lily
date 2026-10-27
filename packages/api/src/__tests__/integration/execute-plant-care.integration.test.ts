import { createMockCurrentUser } from '@lily/api/__tests__/mocks/auth'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CarePlanRepositoryLive } from '@lily/api/repositories/care-plan.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import {
  PlantRepository,
  PlantRepositoryLive,
} from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { executePlantCare } from '@lily/api/services/plants/helpers/execute-plant-care'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import type { AppEvent } from '@lily/shared/server'
import { count, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array as Arr, Effect, Layer, Option, pipe, Result } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const RepositoriesLive = Layer.mergeAll(
  PlantRepositoryLive,
  CareLogRepositoryLive,
  CareScheduleRepositoryLive,
  NotificationRepositoryLive,
  UserRepositoryLive,
  CarePlanRepositoryLive,
  CanopyRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'executePlantCare - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let userId: string
    let plantId: string

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })

      await db.execute(sql`TRUNCATE TABLE care_logs RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE plants RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)

      const [user] = await db
        .insert(schema.users)
        .values({
          email: `care-race-${Date.now()}@example.com`,
          name: 'Care Race User',
          emailVerified: true,
          role: 'user',
          status: 'active',
          timezone: 'UTC',
        })
        .returning()
      if (!user) throw new Error('Failed to create test user')
      userId = user.id

      const [plant] = await db
        .insert(schema.plants)
        .values({
          userId,
          name: 'Race Plant',
          health: 'HEALTHY',
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
        })
        .returning()
      if (!plant) throw new Error('Failed to create test plant')
      plantId = plant.id

      await db.insert(schema.plantCareSchedules).values({
        plantId,
        careType: 'watering',
        frequencyDays: 7,
      })
    })

    beforeEach(async () => {
      await db.execute(sql`TRUNCATE TABLE care_logs RESTART IDENTITY CASCADE`)
      await db.execute(
        sql`TRUNCATE TABLE notifications RESTART IDENTITY CASCADE`
      )
    })

    afterAll(async () => {
      await db.execute(sql`TRUNCATE TABLE care_logs RESTART IDENTITY CASCADE`)
      await db.execute(
        sql`TRUNCATE TABLE notifications RESTART IDENTITY CASCADE`
      )
      await db.execute(
        sql`TRUNCATE TABLE plant_care_schedules RESTART IDENTITY CASCADE`
      )
      await db.execute(sql`TRUNCATE TABLE plants RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      await pool.end()
    })

    it('two concurrent care requests write one log and publish one CareLogCreated', async () => {
      const publishedEvents: AppEvent[] = []

      const layer = Layer.mergeAll(
        RepositoriesLive,
        createMockDelegationRepository({}),
        createMockEventBus({ publishedEvents }),
        createMockCurrentUser({
          id: userId,
          name: 'Care Race User',
          firstName: null,
          lastName: null,
          email: 'care-race@example.com',
          username: 'carerace',
          createdAt: new Date(),
          updatedAt: new Date(),
          role: 'user',
          status: 'active',
        }),
        createMockWeatherProvider(),
        createMockWeatherCache(),
        createMockWeatherRepository()
      )

      const outcomes = await Effect.runPromise(
        Effect.gen(function* () {
          const plantRepo = yield* PlantRepository
          const plant = yield* plantRepo.findById(plantId)
          if (!plant) throw new Error('Test plant not found')

          const care = executePlantCare(plant, {
            plantId,
            careType: 'watering',
          }).pipe(Effect.result)

          return yield* Effect.forEach([care, care], (run) => run, {
            concurrency: 'unbounded',
          })
        }).pipe(Effect.provide(layer))
      )

      const succeeded = Arr.filter(outcomes, Result.isSuccess)
      const rejected = Arr.filter(outcomes, Result.isFailure)
      expect(succeeded).toHaveLength(1)
      expect(rejected).toHaveLength(1)
      expect(
        pipe(
          Arr.head(rejected),
          Option.map((r) => r.failure._tag),
          Option.getOrNull
        )
      ).toBe('AlreadyCaredTodayError')

      const [row] = await db
        .select({ count: count() })
        .from(schema.careLogs)
        .where(eq(schema.careLogs.plantId, plantId))
      expect(row?.count).toBe(1)

      const created = Arr.filter(
        publishedEvents,
        (e) => e._tag === 'CareLogCreated'
      )
      expect(created).toHaveLength(1)
    })
  }
)
