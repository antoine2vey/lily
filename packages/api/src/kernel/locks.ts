import { Effect } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

const OWNER_LOCK_KEYSPACE = 1

/**
 * The per-user advisory lock, held to the end of the transaction. Everything
 * that adds a living plant to a user, opens a delegation for a user, or gives
 * a user a Canopy membership takes it first, so each of them reads counts and
 * memberships that cannot move before it commits.
 */
export const lockUser = (
  userId: string
): Effect.Effect<void, SqlError, SqlClient.SqlClient> =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    Effect.asVoid(
      sql`SELECT pg_advisory_xact_lock(${OWNER_LOCK_KEYSPACE}, hashtext(${userId}))`
    )
  )
