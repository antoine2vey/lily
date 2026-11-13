import { Outbox, type OutboxTopic } from '@lily/api/kernel/outbox'
import { Context, Effect, type Result, type Schema } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export interface Decision<W, E, A> {
  readonly writes: ReadonlyArray<W>
  readonly events: ReadonlyArray<E>
  readonly outcome: A
}

export const decision = <W, E, A>(
  outcome: A,
  writes: ReadonlyArray<W> = [],
  events: ReadonlyArray<E> = []
): Decision<W, E, A> => ({ writes, events, outcome })

/**
 * The open transaction of the caller. An operation requires it when a lock it
 * takes or a row it writes is only right while that transaction is still open
 * after the operation returns. Only `transact` and `transactQuietly` provide
 * it, so such an operation does not compile outside one of them.
 */
export class Transaction extends Context.Service<
  Transaction,
  Record<never, never>
>()('kernel/Transaction') {}

export interface CommandSpec<Agg, W, E, A, Refusal, R> {
  /** Span name, `<context>.<command>`. */
  readonly name: string
  readonly topic: OutboxTopic<E>
  /** Reads current state and takes the locks the command needs. */
  readonly load: Effect.Effect<Agg, SqlError, R>
  readonly decide: (aggregate: Agg) => Result.Result<Decision<W, E, A>, Refusal>
  readonly apply: (writes: ReadonlyArray<W>) => Effect.Effect<void, SqlError, R>
}

/**
 * One transaction (a savepoint when the caller already holds one) with no
 * relay wake, for a body that appends nothing to the outbox.
 */
export const transactQuietly = <A, E, R>(
  body: Effect.Effect<A, E, R>
): Effect.Effect<
  A,
  E | SqlError,
  Exclude<R, Transaction> | SqlClient.SqlClient
> =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    sql.withTransaction(
      Effect.provideService(body, Transaction, Transaction.of({}))
    )
  )

/**
 * One transaction (a savepoint when the caller already holds one), then a
 * relay wake. A nested call wakes before the outer commit and the relay finds
 * nothing yet; the outermost call wakes again once the rows are visible, so
 * whoever opens the outermost transaction around an append should use this.
 */
export const transact = <A, E, R>(
  body: Effect.Effect<A, E, R>
): Effect.Effect<
  A,
  E | SqlError,
  Exclude<R, Transaction> | SqlClient.SqlClient | Outbox
> =>
  Effect.gen(function* () {
    const outbox = yield* Outbox
    const result = yield* transactQuietly(body)
    yield* outbox.wake
    return result
  })

/**
 * Load, decide, apply and the outbox append, with no transaction of its own.
 * For a command that must put more in the transaction than its own writes: a
 * failure after this body rolls the writes and the events back with it.
 */
export const commandBody = <Agg, W, E, A, Refusal, R>(
  spec: CommandSpec<Agg, W, E, A, Refusal, R>
): Effect.Effect<
  A,
  Refusal | SqlError | Schema.SchemaError,
  R | Outbox | Transaction
> =>
  Effect.gen(function* () {
    const outbox = yield* Outbox
    const aggregate = yield* spec.load
    const decided = yield* Effect.fromResult(spec.decide(aggregate))
    yield* spec.apply(decided.writes)
    yield* outbox.append(spec.topic, decided.events)
    return decided.outcome
  })

/**
 * Runs one command: load, decide, apply and the outbox append, all in one
 * transaction (a savepoint when the caller already holds one). A refusal
 * rolls back and is the only failure; a database error is a defect.
 */
export const runCommand = <Agg, W, E, A, Refusal, R>(
  spec: CommandSpec<Agg, W, E, A, Refusal, R>
): Effect.Effect<
  A,
  Refusal,
  Exclude<R, Transaction> | SqlClient.SqlClient | Outbox
> =>
  transact(commandBody(spec)).pipe(
    Effect.catchTag('SqlError', Effect.die),
    Effect.catchTag('SchemaError', Effect.die),
    Effect.withSpan(spec.name)
  )
