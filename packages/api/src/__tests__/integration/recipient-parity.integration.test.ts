import {
  createMockRecipientRepository,
  type RecipientWorld,
} from '@lily/api/__tests__/mocks/recipient.repository'
import {
  RecipientRepository,
  RecipientRepositoryLive,
} from '@lily/api/repositories/recipient.repository'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Effect, Layer } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const RecipientsLive = RecipientRepositoryLive.pipe(
  Layer.provide(DrizzleLive),
  Layer.provide(PgLive)
)

const STATUSES = schema.userStatusEnum.enumValues

const plantValues = {
  name: 'Monstera',
  humidityRating: 3,
  lightingRating: 3,
  petToxicityRating: 1,
  wateringRating: 3,
}

const audienceOf = <E>(
  layer: Layer.Layer<RecipientRepository, E>,
  plantIds: ReadonlyArray<string>
) =>
  Effect.runPromise(
    Effect.flatMap(RecipientRepository, (repo) =>
      repo.audienceOf(plantIds)
    ).pipe(Effect.provide(layer))
  )

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Recipient audience parity - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let plantIds: string[]
    const named = new Map<string, string>()

    const user = async (name: string, status: (typeof STATUSES)[number]) => {
      const [row] = await db
        .insert(schema.users)
        .values({ email: `${name}@example.com`, emailVerified: true, status })
        .returning({ id: schema.users.id })
      if (!row) throw new Error('user insert returned nothing')
      named.set(name, row.id)
      return row.id
    }

    const plant = async (
      name: string,
      owner: { userId: string } | { canopyId: string }
    ) => {
      const [row] = await db
        .insert(schema.plants)
        .values({ ...plantValues, ...owner, name })
        .returning({ id: schema.plants.id })
      if (!row) throw new Error('plant insert returned nothing')
      named.set(name, row.id)
      plantIds.push(row.id)
      return row.id
    }

    const delegate = async (
      ownerId: string,
      caretakerId: string,
      plantId: string,
      status: 'active' | 'pending' | 'completed'
    ) => {
      const [delegation] = await db
        .insert(schema.careDelegations)
        .values({
          ownerId,
          caretakerId,
          status,
          startDate: new Date('2026-01-01'),
          endDate: new Date('2026-12-31'),
        })
        .returning({ id: schema.careDelegations.id })
      if (!delegation) throw new Error('delegation insert returned nothing')
      await db
        .insert(schema.delegationPlants)
        .values({ delegationId: delegation.id, plantId })
    }

    const worldFromDb = async (): Promise<RecipientWorld> => ({
      users: await db
        .select({ id: schema.users.id, status: schema.users.status })
        .from(schema.users),
      plants: await db
        .select({
          id: schema.plants.id,
          userId: schema.plants.userId,
          canopyId: schema.plants.canopyId,
        })
        .from(schema.plants),
      members: await db.select().from(schema.canopyMembers),
      mutes: await db.select().from(schema.canopyPlantMutes),
      delegations: await db.select().from(schema.careDelegations),
      delegationPlants: await db.select().from(schema.delegationPlants),
    })

    const id = (name: string) => {
      const value = named.get(name)
      if (value === undefined) throw new Error(`nothing seeded as ${name}`)
      return value
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    beforeEach(async () => {
      await db.execute(sql`TRUNCATE TABLE canopies RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      named.clear()
      plantIds = []

      const [canopy] = await db
        .insert(schema.canopies)
        .values({ name: 'Home' })
        .returning({ id: schema.canopies.id })
      if (!canopy) throw new Error('canopy insert returned nothing')
      const shared = await plant('shared', { canopyId: canopy.id })
      await plant('shared-quiet', { canopyId: canopy.id })

      let joined = Date.parse('2026-01-01T00:00:00Z')
      const join = async (userId: string) => {
        joined += 60_000
        await db.insert(schema.canopyMembers).values({
          canopyId: canopy.id,
          userId,
          joinedAt: new Date(joined),
        })
      }

      for (const status of STATUSES) {
        const owner = await user(`owner-${status}`, status)
        await plant(`alone-${status}`, { userId: owner })

        const activeOwner = await user(`delegator-${status}`, 'active')
        const caretaker = await user(`caretaker-${status}`, status)
        await delegate(
          activeOwner,
          caretaker,
          await plant(`delegated-to-${status}`, { userId: activeOwner }),
          'active'
        )

        const delegatingOwner = await user(`owner-delegating-${status}`, status)
        const activeCaretaker = await user(`caretaker-of-${status}`, 'active')
        await delegate(
          delegatingOwner,
          activeCaretaker,
          await plant(`delegated-by-${status}`, { userId: delegatingOwner }),
          'active'
        )

        const pendingCaretaker = await user(
          `pending-caretaker-${status}`,
          status
        )
        await delegate(
          activeOwner,
          pendingCaretaker,
          await plant(`pending-to-${status}`, { userId: activeOwner }),
          'pending'
        )

        await join(await user(`member-${status}`, status))
        const muter = await user(`muter-${status}`, status)
        await join(muter)
        await db
          .insert(schema.canopyPlantMutes)
          .values({ userId: muter, plantId: shared })
      }
    })

    afterAll(async () => {
      await db.execute(sql`TRUNCATE TABLE canopies RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      await pool.end()
    })

    it('returns the same audience from the database and the mock', async () => {
      const mock = createMockRecipientRepository(await worldFromDb())

      const live = await audienceOf(RecipientsLive, plantIds)

      expect(live).toEqual(await audienceOf(mock, plantIds))
      expect(live.size).toBe(plantIds.length)
    })

    it('reaches only active users, through the caretaker before the owner', async () => {
      const live = await audienceOf(RecipientsLive, plantIds)
      const heard = (plantName: string) => live.get(id(plantName))

      expect(heard('alone-active')).toEqual([id('owner-active')])
      expect(heard('alone-suspended')).toEqual([])
      expect(heard('delegated-to-active')).toEqual([id('caretaker-active')])
      expect(heard('delegated-to-banned')).toEqual([id('delegator-banned')])
      expect(heard('delegated-by-pending_deletion')).toEqual([
        id('caretaker-of-pending_deletion'),
      ])
      expect(heard('pending-to-active')).toEqual([id('delegator-active')])
      expect(heard('shared')).toEqual([id('member-active')])
      expect(heard('shared-quiet')).toEqual([
        id('member-active'),
        id('muter-active'),
      ])
    })

    it('answers an unknown plant with nobody', async () => {
      const unknown = '00000000-0000-4000-8000-000000000000'

      const live = await audienceOf(RecipientsLive, [unknown])

      expect(live).toEqual(new Map([[unknown, []]]))
      expect(
        await audienceOf(createMockRecipientRepository(await worldFromDb()), [
          unknown,
        ])
      ).toEqual(live)
    })
  }
)
