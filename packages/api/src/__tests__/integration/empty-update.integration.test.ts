import {
  PlantRepository,
  PlantRepositoryLive,
} from '@lily/api/repositories/plant.repository'
import {
  UserRepository,
  UserRepositoryLive,
} from '@lily/api/repositories/user.repository'
import { DrizzleLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { ConfigProvider, Effect, Layer } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Repository update with nothing to change - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let userId: string
    let plantId: string

    const ReposLive = Layer.mergeAll(
      UserRepositoryLive,
      PlantRepositoryLive
    ).pipe(
      Layer.provide(DrizzleLive),
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            DATABASE_URL: process.env.DATABASE_URL_TEST,
          })
        )
      )
    )

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `empty-update-${Date.now()}@example.com`,
          name: `empty_update_${Date.now()}`,
          emailVerified: true,
        })
        .returning()
      userId = user!.id
      const [plant] = await db
        .insert(schema.plants)
        .values({
          userId,
          name: 'Pothos',
          humidityRating: 1,
          lightingRating: 1,
          petToxicityRating: 1,
          wateringRating: 1,
        })
        .returning()
      plantId = plant!.id
    })

    afterAll(async () => {
      await db.delete(schema.users).where(eq(schema.users.id, userId))
      await pool.end()
    })

    it('returns the user unchanged instead of failing', async () => {
      const user = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* UserRepository
          return yield* repo.update(userId, {})
        }).pipe(Effect.provide(ReposLive))
      )

      expect(user?.id).toBe(userId)
    })

    it('returns the plant unchanged instead of failing', async () => {
      const plant = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* PlantRepository
          return yield* repo.update(plantId, { _tag: 'User', userId }, {})
        }).pipe(Effect.provide(ReposLive))
      )

      expect(plant?.name).toBe('Pothos')
    })
  }
)
