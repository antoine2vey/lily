import { Effect, Exit, Layer } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type * as Connection from 'effect/sql/SqlConnection'
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

/**
 * The connection the mock provides inside a transaction, under the key a real
 * client uses, so a test can see which effects still hold it.
 */
export const MockTransactionConnection = SqlClient.TransactionConnection(-1)

const transactionConnection = {} as Connection.Connection

export const createMockSqlClient = (
  options: MockSqlClientOptions = {}
): Layer.Layer<SqlClient.SqlClient> => {
  let depth = 0
  const signalOutermost = (event: TransactionEvent) =>
    Effect.sync(() => {
      if (depth === 0) options.onTransaction?.(event)
    })
  const client = Object.assign(() => Effect.succeed([]), {
    join: () => () => [],
    transactionService: MockTransactionConnection,
    withTransaction: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      signalOutermost('begin').pipe(
        Effect.andThen(
          Effect.sync(() => {
            depth++
          })
        ),
        Effect.andThen(
          Effect.withSpan(
            Effect.provideService(effect, MockTransactionConnection, [
              transactionConnection,
              depth,
            ]),
            'sql.transaction'
          )
        ),
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
