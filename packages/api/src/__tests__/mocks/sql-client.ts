import { Effect, Exit, Layer } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import { SqlError, UnknownError } from 'effect/sql/SqlError'

export type TransactionEvent = 'begin' | 'commit' | 'rollback'

export interface MockSqlClientOptions {
  onTransaction?: (event: TransactionEvent) => void
  /**
   * The outermost commit fails although what the transaction wrote stays, as
   * when the connection drops before the database acknowledges the commit.
   */
  commitUnanswered?: boolean
}

const unanswered = new SqlError({
  reason: new UnknownError({
    cause: new Error('connection lost'),
    message: 'connection lost',
  }),
})

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
        ),
        Effect.tap(() =>
          depth === 0 && options.commitUnanswered
            ? Effect.fail(unanswered)
            : Effect.void
        )
      ),
  })
  return Layer.succeed(
    SqlClient.SqlClient,
    client as unknown as SqlClient.SqlClient
  )
}

export const MockSqlClientLive = createMockSqlClient()
