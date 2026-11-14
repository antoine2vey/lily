import type { Transaction } from '@lily/api/kernel/transact'
import { Array, Effect } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

const OWNER_LOCK_KEYSPACE = 1

/**
 * The per-user advisory lock, held to the end of the transaction. Everything
 * that adds a living plant to a user, opens a delegation for a user, or gives
 * a user a Canopy membership takes it first, so each of them reads counts and
 * memberships that cannot move before it commits. An account deletion takes
 * it first too. So the deletion finds every membership and delegation of the
 * user, and whoever would add one behind it finds no account.
 */
export const lockUser = (
  userId: string
): Effect.Effect<void, SqlError, SqlClient.SqlClient | Transaction> =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    Effect.asVoid(
      sql`SELECT pg_advisory_xact_lock(${OWNER_LOCK_KEYSPACE}, hashtext(${userId}))`
    )
  )

/**
 * `lockUser` for every user a transaction names, in one statement and in key
 * order, so two transactions that name the same users cannot deadlock.
 */
export const lockUsers = (
  userIds: Array.NonEmptyReadonlyArray<string>
): Effect.Effect<void, SqlError, SqlClient.SqlClient | Transaction> =>
  Effect.flatMap(SqlClient.SqlClient, (sql) => {
    const named = sql.join(
      ', ',
      false
    )(Array.map(userIds, (userId) => sql`(${userId}::text)`))
    return Effect.asVoid(
      sql`SELECT pg_advisory_xact_lock(${OWNER_LOCK_KEYSPACE}, key) FROM (SELECT DISTINCT hashtext(named.id) AS key FROM (VALUES ${named}) AS named(id) ORDER BY 1) AS keys`
    )
  })
