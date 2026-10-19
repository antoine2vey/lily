import { Effect, Layer } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'

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
