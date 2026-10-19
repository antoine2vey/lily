import { Effect, Layer } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'

/**
 * Runs `withTransaction` bodies inline. Repository mocks hold their state in
 * memory, so there is nothing to begin, commit, or roll back. Raw queries
 * resolve to no rows.
 */
export const createMockSqlClient = (): Layer.Layer<SqlClient.SqlClient> => {
  const client = Object.assign(() => Effect.succeed([]), {
    withTransaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  })
  return Layer.succeed(
    SqlClient.SqlClient,
    client as unknown as SqlClient.SqlClient
  )
}

export const MockSqlClientLive = createMockSqlClient()
