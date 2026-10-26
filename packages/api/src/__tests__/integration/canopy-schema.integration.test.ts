import * as schema from '@lily/db/schema'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Option, Predicate } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const violatedConstraint = async (
  query: PromiseLike<unknown>
): Promise<string | undefined> => {
  try {
    await query
    return undefined
  } catch (error) {
    const pgError = Predicate.hasProperty(error, 'cause') ? error.cause : error
    return Predicate.hasProperty(pgError, 'constraint') &&
      Predicate.isString(pgError.constraint)
      ? pgError.constraint
      : undefined
  }
}

const plantValues = {
  name: 'Monstera',
  humidityRating: 3,
  lightingRating: 3,
  petToxicityRating: 1,
  wateringRating: 3,
}

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Canopy schema - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let alexId: string
    let lilyId: string

    const createCanopy = async (name: string) => {
      const [canopy] = await db
        .insert(schema.canopies)
        .values({ name })
        .returning()
      if (!canopy) throw new Error('canopy insert returned nothing')
      return canopy.id
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
        ])
        .returning()
      if (!alex || !lily) throw new Error('user insert returned nothing')
      alexId = alex.id
      lilyId = lily.id
    })

    afterAll(async () => {
      await db.execute(sql`TRUNCATE TABLE canopies RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      await pool.end()
    })

    it('rejects a plant with no owner', async () => {
      expect(
        await violatedConstraint(db.insert(schema.plants).values(plantValues))
      ).toBe('plants_one_owner')
    })

    it('rejects a plant owned by both a user and a Canopy', async () => {
      const canopyId = await createCanopy('Home')
      expect(
        await violatedConstraint(
          db
            .insert(schema.plants)
            .values({ ...plantValues, userId: alexId, canopyId })
        )
      ).toBe('plants_one_owner')
    })

    it('accepts a plant owned by exactly one of a user or a Canopy', async () => {
      const canopyId = await createCanopy('Home')
      const inserted = await db
        .insert(schema.plants)
        .values([
          { ...plantValues, userId: alexId, createdByUserId: alexId },
          { ...plantValues, canopyId, createdByUserId: alexId },
        ])
        .returning({ id: schema.plants.id })
      expect(inserted).toHaveLength(2)
    })

    it('rejects a room with no owner or with both owners', async () => {
      const canopyId = await createCanopy('Home')
      expect(
        await violatedConstraint(
          db.insert(schema.rooms).values({ name: 'Kitchen' })
        )
      ).toBe('rooms_one_owner')
      expect(
        await violatedConstraint(
          db
            .insert(schema.rooms)
            .values({ name: 'Kitchen', userId: alexId, canopyId })
        )
      ).toBe('rooms_one_owner')
    })

    it('keeps a user in at most one Canopy', async () => {
      const first = await createCanopy('Home')
      const second = await createCanopy('Cabin')
      await db
        .insert(schema.canopyMembers)
        .values({ canopyId: first, userId: lilyId, role: 'member' })
      expect(
        await violatedConstraint(
          db
            .insert(schema.canopyMembers)
            .values({ canopyId: second, userId: lilyId, role: 'member' })
        )
      ).toBe('canopy_members_user_id_unique')
    })

    it('allows one owner per Canopy and any number of members', async () => {
      const canopyId = await createCanopy('Home')
      await db.insert(schema.canopyMembers).values([
        { canopyId, userId: alexId, role: 'owner' },
        { canopyId, userId: lilyId, role: 'member' },
      ])
      const [third] = await db
        .insert(schema.users)
        .values({
          email: `sam-${Date.now()}@example.com`,
          name: 'Sam',
          emailVerified: true,
        })
        .returning()
      if (!third) throw new Error('user insert returned nothing')
      expect(
        await violatedConstraint(
          db
            .insert(schema.canopyMembers)
            .values({ canopyId, userId: third.id, role: 'owner' })
        )
      ).toBe('canopy_members_one_owner_unique')
    })

    it('refuses to delete a Canopy that still holds a plant or a room', async () => {
      const withPlant = await createCanopy('Home')
      await db
        .insert(schema.plants)
        .values({ ...plantValues, canopyId: withPlant })
      expect(
        await violatedConstraint(
          db.delete(schema.canopies).where(eq(schema.canopies.id, withPlant))
        )
      ).toBe('plants_canopy_id_canopies_id_fk')

      const withRoom = await createCanopy('Cabin')
      await db
        .insert(schema.rooms)
        .values({ name: 'Porch', canopyId: withRoom })
      expect(
        await violatedConstraint(
          db.delete(schema.canopies).where(eq(schema.canopies.id, withRoom))
        )
      ).toBe('rooms_canopy_id_canopies_id_fk')
    })

    it('keeps a Canopy plant when its creator is deleted', async () => {
      const canopyId = await createCanopy('Home')
      const [canopyPlant] = await db
        .insert(schema.plants)
        .values({ ...plantValues, canopyId, createdByUserId: lilyId })
        .returning()
      await db
        .insert(schema.plants)
        .values({ ...plantValues, userId: lilyId, createdByUserId: lilyId })

      await db.delete(schema.users).where(eq(schema.users.id, lilyId))

      const remaining = await db.select().from(schema.plants)
      expect(remaining).toHaveLength(1)
      expect(
        Option.fromNullishOr(remaining[0]).pipe(
          Option.map((p) => ({ id: p.id, createdByUserId: p.createdByUserId })),
          Option.getOrNull
        )
      ).toEqual({ id: canopyPlant?.id, createdByUserId: null })
    })
  }
)
