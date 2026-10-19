import type { Effect } from 'effect'
import { Layer } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'

/**
 * Runs `withTransaction` bodies inline. Repository mocks hold their state in
 * memory, so there is nothing to begin, commit, or roll back.
 */
export const createMockSqlClient = (): Layer.Layer<SqlClient.SqlClient> =>
  Layer.succeed(SqlClient.SqlClient, {
    withTransaction: (effect: Effect.Effect<unknown, unknown, unknown>) =>
      effect,
  } as unknown as SqlClient.SqlClient)
