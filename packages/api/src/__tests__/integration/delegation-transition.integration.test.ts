import {
  DelegationRepository,
  DelegationRepositoryLive,
} from '@lily/api/repositories/delegation.repository'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array as Arr, Effect, Layer } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const RepositoryLive = DelegationRepositoryLive.pipe(
  Layer.provideMerge(DrizzleLive),
  Layer.provideMerge(PgLive)
)

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'DelegationRepository.transitionStatus - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let ownerId: string
    let caretakerId: string
    let delegationId: string

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })

      await db.execute(
        sql`TRUNCATE TABLE care_delegations RESTART IDENTITY CASCADE`
      )
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)

      const stamp = Date.now()
      const users = await db
        .insert(schema.users)
        .values([
          {
            email: `owner-${stamp}@example.com`,
            name: 'Owner',
            emailVerified: true,
            role: 'user',
            status: 'active',
          },
          {
            email: `caretaker-${stamp}@example.com`,
            name: 'Caretaker',
            emailVerified: true,
            role: 'user',
            status: 'active',
          },
        ])
        .returning()
      const [owner, caretaker] = users
      if (!owner || !caretaker) throw new Error('Failed to create users')
      ownerId = owner.id
      caretakerId = caretaker.id
    })

    beforeEach(async () => {
      await db.execute(
        sql`TRUNCATE TABLE care_delegations RESTART IDENTITY CASCADE`
      )
      const [row] = await db
        .insert(schema.careDelegations)
        .values({
          ownerId,
          caretakerId,
          status: 'accepted',
          startDate: new Date('2024-01-01'),
          endDate: new Date('2099-12-31'),
        })
        .returning()
      if (!row) throw new Error('Failed to create delegation')
      delegationId = row.id
    })

    afterAll(async () => {
      await db.execute(
        sql`TRUNCATE TABLE care_delegations RESTART IDENTITY CASCADE`
      )
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      await pool.end()
    })

    const currentStatus = async () => {
      const [row] = await db
        .select({ status: schema.careDelegations.status })
        .from(schema.careDelegations)
        .where(eq(schema.careDelegations.id, delegationId))
      return row?.status
    }

    it('does not activate a delegation that was canceled after the read', async () => {
      const activated = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* DelegationRepository
          const canceled = yield* repo.transitionStatus(
            delegationId,
            ['pending', 'accepted', 'active'],
            'canceled',
            { canceledAt: new Date() }
          )
          expect(canceled?.status).toBe('canceled')
          return yield* repo.transitionStatus(
            delegationId,
            ['accepted'],
            'active'
          )
        }).pipe(Effect.provide(RepositoryLive))
      )

      expect(activated).toBeNull()
      expect(await currentStatus()).toBe('canceled')
    })

    it('lets exactly one of two concurrent transitions from the same status win', async () => {
      const results = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* DelegationRepository
          return yield* Effect.forEach(
            ['canceled', 'active'] as const,
            (to) => repo.transitionStatus(delegationId, ['accepted'], to),
            { concurrency: 'unbounded' }
          )
        }).pipe(Effect.provide(RepositoryLive))
      )

      const winners = Arr.filter(results, (r) => r !== null)
      expect(winners).toHaveLength(1)
      expect(await currentStatus()).toBe(winners[0]?.status)
    })
  }
)
