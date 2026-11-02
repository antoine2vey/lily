import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { RoomRepositoryLive } from '@lily/api/repositories/room.repository'
import { findRooms } from '@lily/api/services/rooms/endpoints/find-rooms'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, Effect, Layer } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const ReposLive = RoomRepositoryLive.pipe(
  Layer.provideMerge(DrizzleLive),
  Layer.provideMerge(PgLive)
)

const roomNames = (userId: string, includeCanopy: boolean) =>
  Effect.runPromise(
    findRooms({ includeCanopy }).pipe(
      Effect.map(Array.map((room) => room.name)),
      Effect.provide(
        Layer.merge(ReposLive, createMockCurrentUser({ id: userId }))
      )
    )
  )

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Canopy rooms in GET /rooms - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let lilyId: string
    let samId: string

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    beforeEach(async () => {
      await db.execute(sql`TRUNCATE TABLE canopies RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      const stamp = Date.now()
      const [lily, sam] = await db
        .insert(schema.users)
        .values([
          { email: `lily-${stamp}@example.com`, emailVerified: true },
          { email: `sam-${stamp}@example.com`, emailVerified: true },
        ])
        .returning()
      if (!lily || !sam) throw new Error('user insert returned nothing')
      lilyId = lily.id
      samId = sam.id
      const [canopy] = await db
        .insert(schema.canopies)
        .values({ name: 'Home' })
        .returning()
      if (!canopy) throw new Error('canopy insert returned nothing')
      await db
        .insert(schema.canopyMembers)
        .values({ canopyId: canopy.id, userId: lilyId, role: 'owner' })
      await db.insert(schema.rooms).values([
        { name: 'Bedroom', userId: lilyId, order: 1 },
        { name: 'Canopy kitchen', canopyId: canopy.id, order: 1 },
        { name: 'Study', userId: samId, order: 1 },
      ])
    })

    afterAll(async () => {
      await db.execute(sql`TRUNCATE TABLE canopies RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      await pool.end()
    })

    it('lists the Canopy room for a member only with the flag', async () => {
      expect(await roomNames(lilyId, false)).toEqual(['Bedroom'])
      expect((await roomNames(lilyId, true)).sort()).toEqual([
        'Bedroom',
        'Canopy kitchen',
      ])
    })

    it('never lists it for someone outside the Canopy', async () => {
      expect(await roomNames(samId, false)).toEqual(['Study'])
      expect(await roomNames(samId, true)).toEqual(['Study'])
    })
  }
)
