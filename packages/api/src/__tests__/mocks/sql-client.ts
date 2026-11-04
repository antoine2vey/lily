import { Effect, Exit, Layer } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'

export type TransactionEvent = 'begin' | 'commit' | 'rollback'

export interface MockSqlClientOptions {
  onTransaction?: (event: TransactionEvent) => void
}

export const createMockSqlClient = (
  options: MockSqlClientOptions = {}
): Layer.Layer<SqlClient.SqlClient> => {
  let depth = 0
  const signalOutermost = (event: TransactionEvent) =>
    Effect.sync(() => {
      if (depth === 0) options.onTransaction?.(event)
    })
  const client = Object.assign(() => Effect.succeed([]), {
    withTransaction: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      signalOutermost('begin').pipe(
        Effect.andThen(
          Effect.sync(() => {
            depth++
          })
        ),
        Effect.andThen(effect),
        Effect.onExit((exit) =>
          Effect.sync(() => {
            depth--
          }).pipe(
            Effect.andThen(
              signalOutermost(Exit.isSuccess(exit) ? 'commit' : 'rollback')
            )
          )
        )
      ),
  })
  return Layer.succeed(
    SqlClient.SqlClient,
    client as unknown as SqlClient.SqlClient
  )
}

export const MockSqlClientLive = createMockSqlClient()
