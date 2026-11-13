import { settled } from '@lily/api/__tests__/integration/canopy-layers'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { CareReadsLive } from '@lily/api/contexts/care'
import { AchievementRepositoryLive } from '@lily/api/repositories/achievement.repository'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { RoomRepositoryLive } from '@lily/api/repositories/room.repository'
import { SubscriptionRepositoryLive } from '@lily/api/repositories/subscription.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { findPlantById } from '@lily/api/services/plants/endpoints/find-plant-by-id'
import {
  mutePlant,
  unmutePlant,
  withMuteState,
} from '@lily/api/services/plants/endpoints/mute-plant'
import {
  withPlantAuth,
  withPlantPermit,
} from '@lily/api/services/plants/helpers/with-plant-access'
import { LimitCheckerLive } from '@lily/api/services/subscriptions/limit-checker'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Effect, Layer } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const ReposLive = Layer.mergeAll(
  AchievementRepositoryLive,
  CanopyRepositoryLive,
  CareScheduleRepositoryLive,
  CareReadsLive,
  DelegationRepositoryLive,
  NotificationRepositoryLive,
  PlantRepositoryLive,
  RoomRepositoryLive,
  SubscriptionRepositoryLive,
  UserRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const appAs = (userId: string) =>
  Layer.mergeAll(
    LimitCheckerLive,
    createMockMessageQueue(),
    createMockEventBus(),
    createMockCurrentUser({ id: userId })
  ).pipe(Layer.provideMerge(ReposLive))

const plantValues = {
  name: 'Monstera',
  humidityRating: 3,
  lightingRating: 3,
  petToxicityRating: 1,
  wateringRating: 3,
}

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Plant detail mute state - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let alexId: string
    let lilyId: string
    let canopyId: string

    const insertPlant = async (
      values: Partial<typeof schema.plants.$inferInsert>
    ) => {
      const [plant] = await db
        .insert(schema.plants)
        .values({ ...plantValues, ...values })
        .returning({ id: schema.plants.id })
      if (!plant) throw new Error('plant insert returned nothing')
      return plant.id
    }

    const detailAs = (userId: string, plantId: string) =>
      Effect.runPromise(
        withPlantAuth(plantId, 'view').pipe(
          Effect.flatMap(findPlantById),
          Effect.flatMap(withMuteState),
          Effect.provide(appAs(userId))
        )
      )

    const as = (
      userId: string,
      plantId: string,
      run: typeof mutePlant | typeof unmutePlant
    ) =>
      Effect.runPromise(
        withPlantPermit(plantId, 'mute').pipe(
          Effect.flatMap((permit) => run(permit)),
          settled,
          Effect.provide(appAs(userId))
        )
      )

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
        .values([
          { email: `alex-${stamp}@example.com`, emailVerified: true },
          { email: `lily-${stamp}@example.com`, emailVerified: true },
        ])
        .returning()
      if (!alex || !lily) throw new Error('user insert returned nothing')
      alexId = alex.id
      lilyId = lily.id
      const [canopy] = await db
        .insert(schema.canopies)
        .values({ name: 'Home' })
        .returning()
      if (!canopy) throw new Error('canopy insert returned nothing')
      canopyId = canopy.id
      await db.insert(schema.canopyMembers).values([
        { canopyId, userId: alexId, role: 'owner' },
        { canopyId, userId: lilyId, role: 'member' },
      ])
    })

    afterAll(async () => {
      await db.execute(sql`TRUNCATE TABLE canopies RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      await pool.end()
    })

    it('reports a Canopy plant as muted only to the member who muted it', async () => {
      const plantId = await insertPlant({ canopyId, createdByUserId: alexId })

      expect((await detailAs(lilyId, plantId)).muted).toBe(false)

      await as(lilyId, plantId, mutePlant)

      expect((await detailAs(lilyId, plantId)).muted).toBe(true)
      expect((await detailAs(alexId, plantId)).muted).toBe(false)

      await as(lilyId, plantId, unmutePlant)

      expect((await detailAs(lilyId, plantId)).muted).toBe(false)
    })

    it('leaves the mute state off a personal plant', async () => {
      const plantId = await insertPlant({
        userId: alexId,
        createdByUserId: alexId,
      })

      expect(await detailAs(alexId, plantId)).not.toHaveProperty('muted')
    })
  }
)
