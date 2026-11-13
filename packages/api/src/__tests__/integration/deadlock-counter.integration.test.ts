import {
  deadlocks,
  sessionsWaitingForALock,
} from '@lily/api/__tests__/integration/lock-waits'
import { Array, Order } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

const KEYSPACE = 7_403_117

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'The deadlock counter the race tests read - Integration',
  () => {
    let pool: pg.Pool

    beforeAll(() => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
    })

    afterAll(async () => {
      await pool.end()
    })

    const take = (session: pg.PoolClient, key: number) =>
      session.query('SELECT pg_advisory_xact_lock($1, $2)', [KEYSPACE, key])

    const settled = (statement: Promise<unknown>) =>
      statement.then(
        () => 'granted',
        (error: { readonly code?: string }) => error.code ?? 'failed'
      )

    it('has counted a deadlock once the two sessions that made it are idle', async () => {
      const before = await deadlocks(pool)
      const first = await pool.connect()
      const second = await pool.connect()

      await first.query('BEGIN')
      await second.query('BEGIN')
      await take(first, 1)
      await take(second, 2)
      const firstAsksForTheSecondKey = settled(take(first, 2))
      const waiting = await sessionsWaitingForALock(pool, 1)
      const secondAsksForTheFirstKey = settled(take(second, 1))
      const answers = Array.sort(
        [await firstAsksForTheSecondKey, await secondAsksForTheFirstKey],
        Order.String
      )
      await first.query('ROLLBACK')
      first.release()
      await second.query('ROLLBACK')
      second.release()

      expect({
        waiting,
        answers,
        counted: (await deadlocks(pool)) - before,
      }).toEqual({
        waiting: 1,
        answers: ['40P01', 'granted'],
        counted: 1,
      })
    })

    it('refuses to read the count while another session is inside a transaction', async () => {
      const session = await pool.connect()
      await session.query('BEGIN')

      const read = await deadlocks(pool).then(
        () => 'read',
        (error: Error) => error.message
      )
      await session.query('ROLLBACK')
      session.release()

      expect(read).toBe(
        'a session never went idle, so the deadlock count cannot be trusted'
      )
    })
  }
)
