import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { AchievementRepositoryLive } from '@lily/api/repositories/achievement.repository'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { RoomRepositoryLive } from '@lily/api/repositories/room.repository'
import { SubscriptionRepositoryLive } from '@lily/api/repositories/subscription.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { sharePlantWithCanopy } from '@lily/api/services/plants/endpoints/share-plant-with-canopy'
import { unsharePlant } from '@lily/api/services/plants/endpoints/unshare-plant'
import { withPlantAuth } from '@lily/api/services/plants/helpers/with-plant-access'
import { LimitCheckerLive } from '@lily/api/services/subscriptions/limit-checker'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { and, count, eq, isNull, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, Effect, Layer } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const ReposLive = Layer.mergeAll(
  AchievementRepositoryLive,
  CanopyRepositoryLive,
  CareScheduleRepositoryLive,
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
  'Canopy plant moves racing a revive - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let alexId: string
    let lilyId: string
    let canopyId: string

    const insertPlants = (
      n: number,
      values: Partial<typeof schema.plants.$inferInsert>
    ) =>
      db
        .insert(schema.plants)
        .values(Array.makeBy(n, () => ({ ...plantValues, ...values })))
        .returning({ id: schema.plants.id })

    const livingIn = async (where: ReturnType<typeof eq>) => {
      const [row] = await db
        .select({ n: count() })
        .from(schema.plants)
        .where(and(where, isNull(schema.plants.diedAt)))
      return row?.n
    }

    const untilALockWait = async () => {
      for (let waited = 0; waited < 100; waited++) {
        const blocked = await pool.query(
          'SELECT count(*)::int AS n FROM pg_locks WHERE NOT granted'
        )
        if (blocked.rows[0]?.n > 0) return
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
    }

    const reviveWhileMoveWaits = async <A>(
      lock: string,
      plantId: string,
      move: () => Promise<A>
    ) => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(lock)
        await client.query('UPDATE plants SET died_at = NULL WHERE id = $1', [
          plantId,
        ])
        const moved = move()
        await untilALockWait()
        await client.query('COMMIT')
        return await moved
      } finally {
        client.release()
      }
    }

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

    it('keeps a full free Canopy at five when a share races the revive of the shared plant', async () => {
      await insertPlants(5, { canopyId, createdByUserId: alexId })
      const [dead] = await insertPlants(1, {
        userId: alexId,
        createdByUserId: alexId,
        diedAt: new Date('2026-01-01'),
      })
      if (!dead) throw new Error('plant insert returned nothing')

      const exit = await reviveWhileMoveWaits(
        `SELECT pg_advisory_xact_lock(1, hashtext('${alexId}'))`,
        dead.id,
        () =>
          Effect.runPromiseExit(
            withPlantAuth(dead.id, 'share').pipe(
              Effect.flatMap((plant) => sharePlantWithCanopy(plant, {})),
              Effect.provide(appAs(alexId))
            )
          )
      )

      expect(failureOf(exit)).toMatchObject({
        _tag: 'LimitExceededError',
        feature: 'canopy_plants',
      })
      expect(await livingIn(eq(schema.plants.canopyId, canopyId))).toBe(5)
    })

    it('keeps a free member at five when an unshare races the revive of the plant', async () => {
      await insertPlants(5, { userId: lilyId, createdByUserId: lilyId })
      const [dead] = await insertPlants(1, {
        canopyId,
        createdByUserId: lilyId,
        diedAt: new Date('2026-01-01'),
      })
      if (!dead) throw new Error('plant insert returned nothing')

      const exit = await reviveWhileMoveWaits(
        `SELECT id FROM canopies WHERE id = '${canopyId}' FOR UPDATE`,
        dead.id,
        () =>
          Effect.runPromiseExit(
            withPlantAuth(dead.id, 'unshare').pipe(
              Effect.flatMap((plant) => unsharePlant(plant, {})),
              Effect.provide(appAs(lilyId))
            )
          )
      )

      expect(failureOf(exit)).toMatchObject({
        _tag: 'LimitExceededError',
        feature: 'plants',
      })
      expect(await livingIn(eq(schema.plants.userId, lilyId))).toBe(5)
    })
  }
)
