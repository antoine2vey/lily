import { CareOnPostgresLive } from '@lily/api/__tests__/integration/care-layers'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import { CareReadsLive } from '@lily/api/contexts/care'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { createCareLog } from '@lily/api/services/care-logs/endpoints/create-care-log'
import { withPlantPermit } from '@lily/api/services/plants/helpers/with-plant-access'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Effect, Layer } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const RepositoriesLive = Layer.mergeAll(
  CanopyRepositoryLive,
  CareLogRepositoryLive,
  CareReadsLive,
  CareScheduleRepositoryLive,
  DelegationRepositoryLive,
  NotificationRepositoryLive,
  PlantRepositoryLive,
  UserRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'createCareLog actor - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let ownerId: string
    let caretakerId: string
    let plantId: string

    const careAs = (userId: string) =>
      Effect.runPromise(
        withPlantPermit(plantId, 'care').pipe(
          Effect.flatMap((permit) =>
            createCareLog(permit, { type: 'watering' })
          ),
          Effect.provide(
            CareOnPostgresLive.pipe(
              Layer.provideMerge(
                Layer.mergeAll(
                  RepositoriesLive,
                  createMockEventBus({ publishedEvents: [] }),
                  createMockCurrentUser({ id: userId }),
                  createMockWeatherProvider(),
                  createMockWeatherCache(),
                  createMockWeatherRepository()
                )
              )
            )
          )
        )
      )

    const actorOf = async (careLogId: string) => {
      const [row] = await db
        .select({ performedByUserId: schema.careLogs.performedByUserId })
        .from(schema.careLogs)
        .where(eq(schema.careLogs.id, careLogId))
      return row?.performedByUserId
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)

      const stamp = Date.now()
      const [owner, caretaker] = await db
        .insert(schema.users)
        .values([
          { email: `owner-${stamp}@example.com`, emailVerified: true },
          { email: `caretaker-${stamp}@example.com`, emailVerified: true },
        ])
        .returning()
      if (!owner || !caretaker) throw new Error('user insert returned nothing')
      ownerId = owner.id
      caretakerId = caretaker.id

      const [inserted] = await db
        .insert(schema.plants)
        .values({
          name: 'Monstera',
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
          userId: ownerId,
          createdByUserId: ownerId,
        })
        .returning()
      if (!inserted) throw new Error('plant insert returned nothing')
      plantId = inserted.id

      const [delegation] = await db
        .insert(schema.careDelegations)
        .values({
          ownerId,
          caretakerId,
          status: 'active',
          startDate: new Date('2024-01-01'),
          endDate: new Date('2099-12-31'),
        })
        .returning()
      if (!delegation) throw new Error('delegation insert returned nothing')
      await db
        .insert(schema.delegationPlants)
        .values({ delegationId: delegation.id, plantId })
    })

    beforeEach(async () => {
      await db.execute(sql`TRUNCATE TABLE care_logs RESTART IDENTITY CASCADE`)
    })

    afterAll(async () => {
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      await pool.end()
    })

    it('records the owner as the actor when the owner cares', async () => {
      const log = await careAs(ownerId)
      expect(await actorOf(log.id)).toBe(ownerId)
    })

    it('records the caretaker as the actor when a delegation caretaker cares', async () => {
      const log = await careAs(caretakerId)
      expect(await actorOf(log.id)).toBe(caretakerId)
    })
  }
)
