import {
  PlantRepository,
  PlantRepositoryLive,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import type { CanopyId, CareType, PlantOwner } from '@lily/shared'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, Effect, Layer, Order, pipe } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const RepositoryLive = PlantRepositoryLive.pipe(
  Layer.provideMerge(DrizzleLive),
  Layer.provideMerge(PgLive)
)

const livingOf = (owner: PlantOwner) =>
  Effect.runPromise(
    Effect.flatMap(PlantRepository, (repo) =>
      repo.findLivingByOwner(owner)
    ).pipe(Effect.provide(RepositoryLive))
  )

const plantValues = {
  humidityRating: 3,
  lightingRating: 3,
  petToxicityRating: 1,
  wateringRating: 3,
}

const summary = (plants: ReadonlyArray<PlantWithRoom>) =>
  pipe(
    Array.map(plants, (plant) => ({
      name: plant.name,
      ownership: plant.ownership,
      schedules: pipe(
        Array.map(plant.schedules, (s) => ({
          careType: s.careType,
          frequencyDays: s.frequencyDays,
        })),
        Array.sort(
          Order.mapInput(Order.String, (s: { careType: string }) => s.careType)
        )
      ),
    })),
    Array.sort(Order.mapInput(Order.String, (p: { name: string }) => p.name))
  )

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'PlantRepository.findLivingByOwner - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let alexOwner: PlantOwner
    let canopyOwner: PlantOwner

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    beforeEach(async () => {
      await db.execute(sql`TRUNCATE TABLE canopies RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      const stamp = Date.now()
      const [alex, sam] = await db
        .insert(schema.users)
        .values([
          {
            email: `alex-${stamp}@example.com`,
            name: 'Alex',
            emailVerified: true,
          },
          {
            email: `sam-${stamp}@example.com`,
            name: 'Sam',
            emailVerified: true,
          },
        ])
        .returning()
      if (!alex || !sam) throw new Error('user insert returned nothing')
      const [canopy] = await db
        .insert(schema.canopies)
        .values({ name: 'Home' })
        .returning()
      if (!canopy) throw new Error('canopy insert returned nothing')
      const canopyId = canopy.id as CanopyId
      await db
        .insert(schema.canopyMembers)
        .values({ canopyId, userId: alex.id, role: 'owner' })
      alexOwner = { _tag: 'User', userId: alex.id }
      canopyOwner = { _tag: 'Canopy', canopyId }
      const samOwner: PlantOwner = { _tag: 'User', userId: sam.id }

      const addPlant = async (
        owner: PlantOwner,
        name: string,
        schedules: ReadonlyArray<{ careType: CareType; frequencyDays: number }>,
        diedAt: Date | null = null
      ) => {
        const [plant] = await db
          .insert(schema.plants)
          .values({
            ...plantValues,
            name,
            ...(owner._tag === 'User'
              ? { userId: owner.userId }
              : { canopyId: owner.canopyId }),
            createdByUserId: alex.id,
            diedAt,
          })
          .returning()
        if (!plant) throw new Error('plant insert returned nothing')
        for (const schedule of schedules) {
          await db.insert(schema.plantCareSchedules).values({
            plantId: plant.id,
            careType: schedule.careType,
            frequencyDays: schedule.frequencyDays,
            lastCareAt: new Date('2026-11-20T09:00:00Z'),
            nextCareAt: new Date('2026-11-27T09:00:00Z'),
            dueDay: '2026-11-27',
          })
        }
      }

      await addPlant(alexOwner, 'Fern', [
        { careType: 'watering', frequencyDays: 7 },
        { careType: 'fertilization', frequencyDays: 30 },
      ])
      await addPlant(alexOwner, 'Cactus', [
        { careType: 'watering', frequencyDays: 21 },
      ])
      await addPlant(
        alexOwner,
        'Rose',
        [{ careType: 'watering', frequencyDays: 3 }],
        new Date('2026-10-01T00:00:00Z')
      )
      await addPlant(canopyOwner, 'Ivy', [
        { careType: 'watering', frequencyDays: 5 },
      ])
      await addPlant(canopyOwner, 'Palm', [
        { careType: 'watering', frequencyDays: 10 },
        { careType: 'misting', frequencyDays: 2 },
      ])
      await addPlant(
        canopyOwner,
        'Basil',
        [{ careType: 'watering', frequencyDays: 2 }],
        new Date('2026-10-01T00:00:00Z')
      )
      await addPlant(samOwner, 'Orchid', [
        { careType: 'watering', frequencyDays: 9 },
      ])
    })

    afterAll(async () => {
      await db.execute(sql`TRUNCATE TABLE canopies RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      await pool.end()
    })

    it("returns a user's own living plants with their schedules, not their canopy's", async () => {
      expect(summary(await livingOf(alexOwner))).toEqual([
        {
          name: 'Cactus',
          ownership: 'owned',
          schedules: [{ careType: 'watering', frequencyDays: 21 }],
        },
        {
          name: 'Fern',
          ownership: 'owned',
          schedules: [
            { careType: 'fertilization', frequencyDays: 30 },
            { careType: 'watering', frequencyDays: 7 },
          ],
        },
      ])
    })

    it("returns a canopy's living plants with their schedules", async () => {
      expect(summary(await livingOf(canopyOwner))).toEqual([
        {
          name: 'Ivy',
          ownership: 'canopy',
          schedules: [{ careType: 'watering', frequencyDays: 5 }],
        },
        {
          name: 'Palm',
          ownership: 'canopy',
          schedules: [
            { careType: 'misting', frequencyDays: 2 },
            { careType: 'watering', frequencyDays: 10 },
          ],
        },
      ])
    })
  }
)
