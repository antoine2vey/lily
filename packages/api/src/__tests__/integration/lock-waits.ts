import { Array, Deferred, Effect } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type pg from 'pg'

const POLLS = 200
const IDLE_POLLS = 80
const POLL_EVERY_MS = 25

const pause = () => new Promise((resolve) => setTimeout(resolve, POLL_EVERY_MS))

const waitingStatements = async (pool: pg.Pool) => {
  const { rows } = await pool.query<{ query: string }>(
    `SELECT query FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`
  )
  return Array.map(rows, (row) => row.query)
}

export const sessionsWaitingForALock = async (
  pool: pg.Pool,
  atLeast: number,
  signal?: AbortSignal
) => {
  for (const _ of Array.range(1, POLLS)) {
    if (signal?.aborted) return 0
    const waiting = (await waitingStatements(pool)).length
    if (waiting >= atLeast) return waiting
    await pause()
  }
  return 0
}

export const sleepsBetweenAttempts = async (pool: pg.Pool) => {
  for (const _ of Array.range(1, IDLE_POLLS)) {
    const { rowCount } = await pool.query(
      `SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event = 'PgSleep'`
    )
    if (rowCount) return true
    await pause()
  }
  return false
}

export const statementsWaitingForALock = async (pool: pg.Pool) => {
  for (const _ of Array.range(1, POLLS)) {
    const waiting = await waitingStatements(pool)
    if (Array.isReadonlyArrayNonEmpty(waiting)) return waiting
    await pause()
  }
  throw new Error('no session ever waited on a lock')
}

export const waitsForALock = async (pool: pg.Pool, other: Promise<unknown>) => {
  let settled = false
  const mark = () => {
    settled = true
  }
  void other.then(mark, mark)
  for (const _ of Array.range(1, POLLS)) {
    const waiting = await waitingStatements(pool)
    if (settled) return false
    if (Array.isReadonlyArrayNonEmpty(waiting)) return true
    await pause()
  }
  return false
}

export const readBehind = (rival: Deferred.Deferred<void>) =>
  Effect.map(
    SqlClient.SqlClient,
    (sql) =>
      <A, E, R>(read: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
        Effect.gen(function* () {
          const [row] = yield* Effect.orDie(
            sql<{
              aSessionWaitsOnThisOne: boolean
            }>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE pg_backend_pid() = ANY (pg_blocking_pids(pid))) AS "aSessionWaitsOnThisOne"`
          )
          if (row?.aSessionWaitsOnThisOne !== true) yield* Deferred.await(rival)
          return yield* read
        })
  )

const sessionsNotIdle = async (pool: pg.Pool) => {
  const { rows } = await pool.query<{ busy: number }>(
    `SELECT count(*)::int AS busy FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND backend_type = 'client backend' AND state <> 'idle'`
  )
  return rows[0]?.busy ?? 0
}

/**
 * The deadlocks Postgres has counted in this database. A session keeps a
 * deadlock it detected to itself until it is idle outside a transaction, and
 * publishes it before it reports itself idle (`pgstat_report_stat` in
 * `PostgresMain`). So the count is read once every other session is idle, and
 * never while one is not.
 *
 * The publish does not wait for the lock of the counter. When several
 * sessions publish at the same instant, one can keep its count for 10 more
 * seconds, and no short wait sees it.
 */
export const deadlocks = async (pool: pg.Pool) => {
  for (const _ of Array.range(1, IDLE_POLLS)) {
    if ((await sessionsNotIdle(pool)) === 0) {
      const { rows } = await pool.query<{ deadlocks: string }>(
        `SELECT deadlocks::text AS deadlocks FROM pg_stat_database WHERE datname = current_database()`
      )
      return Number(rows[0]?.deadlocks ?? 0)
    }
    await pause()
  }
  throw new Error(
    'a session never went idle, so the deadlock count cannot be trusted'
  )
}
