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
 * Runs one command: load, decide, apply and the outbox append, all in one
 * transaction (a savepoint when the caller already holds one). A refusal
 * rolls back and is the only failure; a database error is a defect.
 */
export const runCommand = <Agg, W, E, A, Refusal, R>(
  spec: CommandSpec<Agg, W, E, A, Refusal, R>
): Effect.Effect<A, Refusal, R | SqlClient.SqlClient | Outbox> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const outbox = yield* Outbox
    const outcome = yield* sql.withTransaction(
      Effect.gen(function* () {
        const aggregate = yield* spec.load
        const decided = yield* Effect.fromResult(spec.decide(aggregate))
        yield* spec.apply(decided.writes)
        yield* outbox.append(spec.topic, decided.events)
        return decided.outcome
      })
    )
    yield* outbox.wake
    return outcome
  }).pipe(
    Effect.catchTag('SqlError', Effect.die),
    Effect.catchTag('SchemaError', Effect.die),
    Effect.withSpan(spec.name)
  )
