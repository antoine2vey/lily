import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CarePlanRepositoryLive } from '@lily/api/repositories/care-plan.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { completeCarePlanStep } from '@lily/api/services/care-plans/endpoints/complete-care-plan-step'
import { withCarePlanStep } from '@lily/api/services/care-plans/helpers/with-care-plan-auth'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, Effect, Layer } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const RepositoriesLive = Layer.mergeAll(
  CanopyRepositoryLive,
  CareLogRepositoryLive,
  CarePlanRepositoryLive,
  CareScheduleRepositoryLive,
  DelegationRepositoryLive,
  NotificationRepositoryLive,
  PlantRepositoryLive,
  UserRepositoryLive,
  createMockMessageQueue()
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000)

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Ticking a shared Canopy plan step - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let alexId: string
    let lilyId: string
    let plantId: string
    let planId: string
    let stepId: string

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    beforeEach(async () => {
      await db.execute(sql`TRUNCATE TABLE canopies RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      const stamp = Date.now()
      const [alex, lily] = await db
        .insert(schema.users)
        .values(
          Array.map(['Alex', 'Lily'], (name) => ({
            email: `${name}-${stamp}@example.com`,
            name: `${name}-${stamp}`,
            emailVerified: true,
            timezone: 'UTC',
          }))
        )
        .returning()
      if (!alex || !lily) throw new Error('user insert returned nothing')
      alexId = alex.id
      lilyId = lily.id
      const [canopy] = await db
        .insert(schema.canopies)
        .values({ name: 'Home' })
        .returning()
      if (!canopy) throw new Error('canopy insert returned nothing')
      await db.insert(schema.canopyMembers).values([
        { canopyId: canopy.id, userId: alexId, role: 'owner' },
        { canopyId: canopy.id, userId: lilyId, role: 'member' },
      ])
      const [plant] = await db
        .insert(schema.plants)
        .values({
          name: 'Monstera',
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
          canopyId: canopy.id,
          createdByUserId: alexId,
        })
        .returning()
      if (!plant) throw new Error('plant insert returned nothing')
      plantId = plant.id
      await db.insert(schema.plantCareSchedules).values({
        plantId,
        careType: 'watering',
        frequencyDays: 7,
        lastCareAt: daysFromNow(-10),
        nextCareAt: daysFromNow(-3),
      })
      const [plan] = await db
        .insert(schema.carePlans)
        .values({
          plantId,
          userId: alexId,
          title: 'Rescue',
          status: 'accepted',
        })
        .returning()
      if (!plan) throw new Error('plan insert returned nothing')
      planId = plan.id
      const [step] = await db
        .insert(schema.carePlanSteps)
        .values({ planId, position: 0, title: 'Water', careType: 'watering' })
        .returning()
      if (!step) throw new Error('step insert returned nothing')
      stepId = step.id
    })

    afterAll(async () => {
      await db.execute(sql`TRUNCATE TABLE canopies RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      await pool.end()
    })

    it('credits the member who ticked and moves the shared schedule', async () => {
      const layer = Layer.mergeAll(
        RepositoriesLive,
        createMockEventBus(),
        createMockCurrentUser({ id: lilyId }),
        createMockWeatherProvider(),
        createMockWeatherCache(),
        createMockWeatherRepository()
      )

      const plan = await Effect.runPromise(
        withCarePlanStep(planId, stepId, 'tick').pipe(
          Effect.flatMap(completeCarePlanStep),
          Effect.provide(layer)
        )
      )

      const logs = await db
        .select()
        .from(schema.careLogs)
        .where(eq(schema.careLogs.plantId, plantId))
      const [schedule] = await db
        .select()
        .from(schema.plantCareSchedules)
        .where(
          and(
            eq(schema.plantCareSchedules.plantId, plantId),
            eq(schema.plantCareSchedules.careType, 'watering')
          )
        )
      expect(Array.map(logs, (l) => l.performedByUserId)).toEqual([lilyId])
      expect(plan.steps[0]?.careLogId).toBe(logs[0]?.id)
      expect(plan.status).toBe('completed')
      expect(schedule?.lastCareAt?.getTime()).toBeGreaterThan(
        daysFromNow(-1).getTime()
      )
      expect(schedule?.nextCareAt?.getTime()).toBeGreaterThan(
        daysFromNow(5).getTime()
      )
    })
  }
)
