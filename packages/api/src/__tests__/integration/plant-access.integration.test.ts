import {
  PlantRepository,
  PlantRepositoryLive,
} from '@lily/api/repositories/plant.repository'
import {
  RoomRepository,
  RoomRepositoryLive,
} from '@lily/api/repositories/room.repository'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import type { CanopyId, PlantOwner } from '@lily/shared'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, Effect, Layer } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const RepositoriesLive = Layer.mergeAll(
  PlantRepositoryLive,
  RoomRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const run = <A, E>(
  effect: Effect.Effect<A, E, PlantRepository | RoomRepository>
) => Effect.runPromise(effect.pipe(Effect.provide(RepositoriesLive)))

const plantValues = {
  name: 'Monstera',
  humidityRating: 3,
  lightingRating: 3,
  petToxicityRating: 1,
  wateringRating: 3,
}

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Plant and room access - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let alexId: string
    let lilyId: string
    let samId: string
    let canopyId: CanopyId
    let canopyOwner: PlantOwner
    let alexOwner: PlantOwner

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    beforeEach(async () => {
      await db.execute(sql`TRUNCATE TABLE canopies RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      const stamp = Date.now()
      const [alex, lily, sam] = await db
        .insert(schema.users)
        .values([
          {
            email: `alex-${stamp}@example.com`,
            name: 'Alex',
            emailVerified: true,
          },
          {
            email: `lily-${stamp}@example.com`,
            name: 'Lily',
            emailVerified: true,
          },
          {
            email: `sam-${stamp}@example.com`,
            name: 'Sam',
            emailVerified: true,
          },
        ])
        .returning()
      if (!alex || !lily || !sam)
        throw new Error('user insert returned nothing')
      alexId = alex.id
      lilyId = lily.id
      samId = sam.id
      const [canopy] = await db
        .insert(schema.canopies)
        .values({ name: 'Home' })
        .returning()
      if (!canopy) throw new Error('canopy insert returned nothing')
      canopyId = canopy.id as CanopyId
      canopyOwner = { _tag: 'Canopy', canopyId }
      alexOwner = { _tag: 'User', userId: alexId }
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

    const insertPlant = async (owner: PlantOwner, name = 'Monstera') => {
      const [plant] = await db
        .insert(schema.plants)
        .values({
          ...plantValues,
          name,
          ...(owner._tag === 'User'
            ? { userId: owner.userId }
            : { canopyId: owner.canopyId }),
          createdByUserId: alexId,
        })
        .returning()
      if (!plant) throw new Error('plant insert returned nothing')
      return plant
    }

    it('lists Canopy plants for a member only when asked, with total equal to items', async () => {
      await insertPlant(alexOwner, 'Mine')
      await insertPlant(canopyOwner, 'Shared one')
      await insertPlant(canopyOwner, 'Shared two')

      const [personalOnly, withCanopy, stranger] = await run(
        Effect.gen(function* () {
          const repo = yield* PlantRepository
          return yield* Effect.all([
            repo.findAll({ userId: alexId, timezone: 'UTC' }),
            repo.findAll({
              userId: alexId,
              timezone: 'UTC',
              includeCanopy: true,
            }),
            repo.findAll({
              userId: samId,
              timezone: 'UTC',
              includeCanopy: true,
            }),
          ])
        })
      )

      expect(Array.map(personalOnly.items, (p) => p.ownership)).toEqual([
        'owned',
      ])
      expect(personalOnly.total).toBe(1)
      expect(withCanopy.total).toBe(3)
      expect(withCanopy.items).toHaveLength(3)
      expect(
        Array.filter(withCanopy.items, (p) => p.ownership === 'canopy').map(
          (p) => (p.ownership === 'canopy' ? p.canopy.name : null)
        )
      ).toEqual(['Home', 'Home'])
      expect(stranger.total).toBe(0)
    })

    it('lists Canopy rooms for a member only when asked', async () => {
      await db.insert(schema.rooms).values([
        { name: 'Alex room', userId: alexId },
        { name: 'Canopy room', canopyId },
      ])

      const [personalOnly, withCanopy, stranger] = await run(
        Effect.gen(function* () {
          const repo = yield* RoomRepository
          return yield* Effect.all([
            repo.findAll({ userId: alexId }),
            repo.findAll({ userId: alexId, includeCanopy: true }),
            repo.findAll({ userId: samId, includeCanopy: true }),
          ])
        })
      )

      expect(Array.map(personalOnly, (r) => r.name)).toEqual(['Alex room'])
      expect(Array.map(withCanopy, (r) => r.name).sort()).toEqual([
        'Alex room',
        'Canopy room',
      ])
      expect(Array.map(withCanopy, (r) => r.owner._tag).sort()).toEqual([
        'Canopy',
        'User',
      ])
      expect(stranger).toEqual([])
    })

    it('refuses a plant mutation scoped to the wrong owner and leaves the row untouched', async () => {
      const plant = await insertPlant(canopyOwner)

      const [renamed, deleted, buried, revived] = await run(
        Effect.gen(function* () {
          const repo = yield* PlantRepository
          return yield* Effect.all([
            repo.update(plant.id, alexOwner, { name: 'Stolen' }),
            repo.delete(plant.id, alexOwner),
            repo.markDead(plant.id, alexOwner, {
              diedAt: new Date(),
              cause: 'unknown',
              note: null,
            }),
            repo.revive(plant.id, { _tag: 'User', userId: lilyId }),
          ])
        })
      )
      const [row] = await db
        .select()
        .from(schema.plants)
        .where(eq(schema.plants.id, plant.id))

      expect([renamed, deleted, buried, revived]).toEqual([
        null,
        null,
        null,
        null,
      ])
      expect(row).toMatchObject({ name: 'Monstera', diedAt: null })
    })

    it('applies a plant mutation scoped to the right owner', async () => {
      const plant = await insertPlant(canopyOwner)

      const renamed = await run(
        Effect.gen(function* () {
          const repo = yield* PlantRepository
          return yield* repo.update(plant.id, canopyOwner, { name: 'Ours' })
        })
      )

      expect(renamed).toMatchObject({ name: 'Ours', owner: canopyOwner })
    })

    it('refuses a room mutation scoped to the wrong owner', async () => {
      const [room] = await db
        .insert(schema.rooms)
        .values({ name: 'Canopy room', canopyId })
        .returning()
      if (!room) throw new Error('room insert returned nothing')

      const [renamed, deleted] = await run(
        Effect.gen(function* () {
          const repo = yield* RoomRepository
          return yield* Effect.all([
            repo.update(room.id, alexOwner, { name: 'Stolen' }),
            repo.delete(room.id, alexOwner),
          ])
        })
      )
      const [row] = await db
        .select()
        .from(schema.rooms)
        .where(eq(schema.rooms.id, room.id))

      expect([renamed, deleted]).toEqual([null, null])
      expect(row?.name).toBe('Canopy room')
    })
  }
)
