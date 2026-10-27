import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import * as schema from '@lily/db/schema'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array as Arr, Record as R } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

const migrationPath = fileURLToPath(
  new URL('../../../../db/drizzle/0063_canopy.sql', import.meta.url)
)

type Actor = 'owner' | 'first' | 'second'

interface Scenario {
  readonly name: string
  readonly delegations: ReadonlyArray<{
    readonly caretaker: Exclude<Actor, 'owner'>
    readonly status: typeof schema.careDelegations.$inferInsert.status
    readonly startDate: string
    readonly endDate: string
    readonly respondedAt?: string
    readonly canceledAt?: string
    readonly completedAt?: string
  }>
  readonly logs: ReadonlyArray<{ readonly at: string; readonly actor: Actor }>
}

const scenarios: ReadonlyArray<Scenario> = [
  {
    name: 'completed at end_date',
    delegations: [
      {
        caretaker: 'first',
        status: 'completed',
        startDate: '2025-01-01T00:00:00Z',
        endDate: '2025-01-10T00:00:00Z',
        respondedAt: '2024-12-30T00:00:00Z',
        completedAt: '2025-01-10T00:05:00Z',
      },
    ],
    logs: [
      { at: '2024-12-31T23:59:59Z', actor: 'owner' },
      { at: '2025-01-01T00:00:00Z', actor: 'first' },
      { at: '2025-01-05T09:00:00Z', actor: 'first' },
      { at: '2025-01-10T00:00:00Z', actor: 'owner' },
    ],
  },
  {
    name: 'completed early',
    delegations: [
      {
        caretaker: 'first',
        status: 'completed',
        startDate: '2025-02-01T00:00:00Z',
        endDate: '2025-02-28T00:00:00Z',
        respondedAt: '2025-01-30T00:00:00Z',
        completedAt: '2025-02-10T12:00:00Z',
      },
    ],
    logs: [
      { at: '2025-02-05T09:00:00Z', actor: 'first' },
      { at: '2025-02-10T12:00:00Z', actor: 'owner' },
      { at: '2025-02-20T09:00:00Z', actor: 'owner' },
    ],
  },
  {
    name: 'canceled after acceptance',
    delegations: [
      {
        caretaker: 'first',
        status: 'canceled',
        startDate: '2025-03-01T00:00:00Z',
        endDate: '2025-03-31T00:00:00Z',
        respondedAt: '2025-02-25T00:00:00Z',
        canceledAt: '2025-03-10T12:00:00Z',
      },
    ],
    logs: [
      { at: '2025-03-05T09:00:00Z', actor: 'first' },
      { at: '2025-03-10T12:00:00Z', actor: 'owner' },
      { at: '2025-03-15T09:00:00Z', actor: 'owner' },
    ],
  },
  {
    name: 'canceled while pending',
    delegations: [
      {
        caretaker: 'first',
        status: 'canceled',
        startDate: '2025-04-01T00:00:00Z',
        endDate: '2025-04-30T00:00:00Z',
        canceledAt: '2025-04-05T00:00:00Z',
      },
    ],
    logs: [{ at: '2025-04-03T09:00:00Z', actor: 'owner' }],
  },
  {
    name: 'rejected',
    delegations: [
      {
        caretaker: 'first',
        status: 'rejected',
        startDate: '2025-05-01T00:00:00Z',
        endDate: '2025-05-31T00:00:00Z',
        respondedAt: '2025-04-28T00:00:00Z',
      },
    ],
    logs: [{ at: '2025-05-10T09:00:00Z', actor: 'owner' }],
  },
  {
    name: 'active',
    delegations: [
      {
        caretaker: 'first',
        status: 'active',
        startDate: '2025-06-01T00:00:00Z',
        endDate: '2099-12-31T00:00:00Z',
        respondedAt: '2025-05-28T00:00:00Z',
      },
    ],
    logs: [
      { at: '2025-05-31T23:59:59Z', actor: 'owner' },
      { at: '2025-06-15T09:00:00Z', actor: 'first' },
    ],
  },
  {
    name: 'adjacent windows',
    delegations: [
      {
        caretaker: 'first',
        status: 'completed',
        startDate: '2025-07-01T00:00:00Z',
        endDate: '2025-07-10T00:00:00Z',
        respondedAt: '2025-06-28T00:00:00Z',
        completedAt: '2025-07-10T00:01:00Z',
      },
      {
        caretaker: 'second',
        status: 'completed',
        startDate: '2025-07-10T00:00:00Z',
        endDate: '2025-07-20T00:00:00Z',
        respondedAt: '2025-07-05T00:00:00Z',
        completedAt: '2025-07-20T00:01:00Z',
      },
    ],
    logs: [
      { at: '2025-07-09T23:59:59Z', actor: 'first' },
      { at: '2025-07-10T00:00:00Z', actor: 'second' },
      { at: '2025-07-20T00:00:00Z', actor: 'owner' },
    ],
  },
]

const optionalDate = (iso: string | undefined) =>
  iso === undefined ? null : new Date(iso)

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  '0063 care-log actor backfill - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    const expected: Array<{ label: string; actorId: string }> = []
    const actual: Record<string, string | null> = {}

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)

      const stamp = Date.now()
      const people = await db
        .insert(schema.users)
        .values([
          { email: `owner-${stamp}@example.com`, emailVerified: true },
          { email: `first-${stamp}@example.com`, emailVerified: true },
          { email: `second-${stamp}@example.com`, emailVerified: true },
        ])
        .returning({ id: schema.users.id })
      const [owner, first, second] = people
      if (!owner || !first || !second) throw new Error('user insert failed')
      const ids: Record<Actor, string> = {
        owner: owner.id,
        first: first.id,
        second: second.id,
      }

      for (const scenario of scenarios) {
        const [plant] = await db
          .insert(schema.plants)
          .values({
            name: scenario.name,
            humidityRating: 3,
            lightingRating: 3,
            petToxicityRating: 1,
            wateringRating: 3,
            userId: ids.owner,
            createdByUserId: ids.owner,
          })
          .returning({ id: schema.plants.id })
        if (!plant) throw new Error('plant insert failed')

        for (const d of scenario.delegations) {
          const [delegation] = await db
            .insert(schema.careDelegations)
            .values({
              ownerId: ids.owner,
              caretakerId: ids[d.caretaker],
              status: d.status,
              startDate: new Date(d.startDate),
              endDate: new Date(d.endDate),
              respondedAt: optionalDate(d.respondedAt),
              canceledAt: optionalDate(d.canceledAt),
              completedAt: optionalDate(d.completedAt),
            })
            .returning({ id: schema.careDelegations.id })
          if (!delegation) throw new Error('delegation insert failed')
          await db
            .insert(schema.delegationPlants)
            .values({ delegationId: delegation.id, plantId: plant.id })
        }

        for (const log of scenario.logs) {
          const label = `${scenario.name} @ ${log.at}`
          await db.insert(schema.careLogs).values({
            type: 'watering',
            date: new Date(log.at),
            plantId: plant.id,
            notes: label,
          })
          expected.push({ label, actorId: ids[log.actor] })
        }
      }

      const migration = await readFile(migrationPath, 'utf8')
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(migration)
        await client.query('COMMIT')
      } finally {
        client.release()
      }

      const rows = await db
        .select({
          notes: schema.careLogs.notes,
          performedByUserId: schema.careLogs.performedByUserId,
        })
        .from(schema.careLogs)
      for (const row of rows) {
        if (row.notes !== null) actual[row.notes] = row.performedByUserId
      }
    })

    afterAll(async () => {
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      await pool.end()
    })

    it('credits each care log to whoever was responsible at that instant', () => {
      expect(R.size(actual)).toBe(expected.length)
      const mismatches = Arr.filter(
        expected,
        ({ label, actorId }) => actual[label] !== actorId
      )
      expect(Arr.map(mismatches, ({ label }) => label)).toEqual([])
    })
  }
)
