import { Outbox, type OutboxTopic } from '@lily/api/kernel/outbox'
import { Effect, type Result } from 'effect'
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
 * One transaction (a savepoint when the caller already holds one), then a
 * relay wake. A nested call wakes before the outer commit and the relay finds
 * nothing yet; the outermost call wakes again once the rows are visible, so
 * whoever opens the outermost transaction around an append should use this.
 */
export const transact = <A, E, R>(
  body: Effect.Effect<A, E, R>
): Effect.Effect<A, E | SqlError, R | SqlClient.SqlClient | Outbox> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const outbox = yield* Outbox
    const result = yield* sql.withTransaction(body)
    yield* outbox.wake
    return result
  })

/**
 * Runs one command: load, decide, apply and the outbox append, all in one
 * transaction (a savepoint when the caller already holds one). A refusal
 * rolls back and is the only failure; a database error is a defect.
 */
export const runCommand = <Agg, W, E, A, Refusal, R>(
  spec: CommandSpec<Agg, W, E, A, Refusal, R>
): Effect.Effect<A, Refusal, R | SqlClient.SqlClient | Outbox> =>
  Effect.gen(function* () {
    const outbox = yield* Outbox
    return yield* transact(
      Effect.gen(function* () {
        const aggregate = yield* spec.load
        const decided = yield* Effect.fromResult(spec.decide(aggregate))
        yield* spec.apply(decided.writes)
        yield* outbox.append(spec.topic, decided.events)
        return decided.outcome
      })
    )
  }).pipe(
    Effect.catchTag('SqlError', Effect.die),
    Effect.catchTag('SchemaError', Effect.die),
    Effect.withSpan(spec.name)
  )
