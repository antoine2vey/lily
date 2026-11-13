import { Array, Deferred, Effect } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type pg from 'pg'

const POLLS = 200
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
