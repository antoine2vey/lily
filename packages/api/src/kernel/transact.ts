import { HELD_NOTHING, type Held } from '@lily/api/kernel/ladder'
import { Outbox, type OutboxTopic } from '@lily/api/kernel/outbox'
import type {
  ErrorOf,
  RefusalMapper,
  RefusalTable,
} from '@lily/api/kernel/refusals'
import {
  Array,
  absurd,
  Context,
  Effect,
  identity,
  Option,
  Ref,
  type Result,
  type Schema,
} from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export interface Decision<W, E, A, N = never> {
  readonly writes: ReadonlyArray<W>
  readonly events: ReadonlyArray<E>
  /** What the command owes its users, recorded with the writes. */
  readonly notices: ReadonlyArray<N>
  readonly outcome: A
}

export const decision = <W, E, A, N = never>(
  outcome: A,
  writes: ReadonlyArray<W> = [],
  events: ReadonlyArray<E> = [],
  notices: ReadonlyArray<N> = []
): Decision<W, E, A, N> => ({ writes, events, notices, outcome })

/**
 * The open transaction of the caller. An operation requires it when a lock it
 * takes or a row it writes is only right while that transaction is still open
 * after the operation returns. Only `transact` and `transactQuietly` provide
 * it, so such an operation does not compile outside one of them.
 */
export class Transaction extends Context.Service<
  Transaction,
  {
    /**
     * Runs `effect` once the outermost transaction has committed. It is
     * dropped when this transaction, or one around it, rolls back.
     */
    readonly afterCommit: (effect: Effect.Effect<void>) => Effect.Effect<void>
    /**
     * The locks of the outermost transaction. A savepoint shares them and
     * puts them back as it found them when it rolls back, as Postgres does.
     * None when no database transaction is open behind this service.
     */
    readonly held: Option.Option<Ref.Ref<Held>>
  }
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
 * relay wake, for a body that appends nothing to the outbox. What the body
 * registered with `afterCommit` runs here when this is the outermost
 * transaction, and goes to the transaction around it otherwise.
 */
export const transactQuietly = <A, E, R>(
  body: Effect.Effect<A, E, R>
): Effect.Effect<
  A,
  E | SqlError,
  Exclude<R, Transaction> | SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const around = yield* Effect.serviceOption(Transaction)
    const registered = yield* Ref.make<ReadonlyArray<Effect.Effect<void>>>([])
    const held = yield* Option.match(
      Option.flatMap(around, (outer) => outer.held),
      { onNone: () => Ref.make(HELD_NOTHING), onSome: Effect.succeed }
    )
    const atEntry = yield* Ref.get(held)
    const result = yield* sql
      .withTransaction(
        Effect.provideService(
          body,
          Transaction,
          Transaction.of({
            afterCommit: (effect) =>
              Ref.update(registered, Array.append(effect)),
            held: Option.some(held),
          })
        )
      )
      .pipe(Effect.onError(() => Ref.set(held, atEntry)))
    const committed = yield* Ref.get(registered)
    yield* Option.match(around, {
      onNone: () => Effect.forEach(committed, identity, { discard: true }),
      onSome: (outer) =>
        Effect.forEach(committed, outer.afterCommit, { discard: true }),
    })
    return result
  })

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
    Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
    Effect.withSpan(spec.name)
  )

export interface Notices<N, Recorded, R = never> {
  /** Records one notice in the transaction of the command. */
  readonly record: (notice: N) => Effect.Effect<Recorded, SqlError, R>
  /** Sends what was recorded. Runs once the outermost transaction commits. */
  readonly dispatch: (recorded: ReadonlyArray<Recorded>) => Effect.Effect<void>
}

/** For a context whose decisions owe no notice. */
export const noNotices: Notices<never, never> = {
  record: absurd,
  dispatch: () => Effect.void,
}

export interface NoticedCommandSpec<Agg, W, E, A, N, Recorded, Refusal, R> {
  readonly topic: OutboxTopic<E>
  /** Reads current state and takes the locks the command needs. */
  readonly load: Effect.Effect<Agg, SqlError, R>
  readonly decide: (
    aggregate: Agg
  ) => Result.Result<Decision<W, E, A, N>, Refusal>
  readonly apply: (writes: ReadonlyArray<W>) => Effect.Effect<void, SqlError, R>
  readonly notices: Notices<N, Recorded, R>
}

/**
 * Load, decide, apply, the outbox append and the notices, with no transaction
 * of its own. For a command that must put more in the transaction than its
 * own writes: a failure after this body rolls the writes, the events and the
 * notices back with it, and nothing is dispatched.
 */
export const noticedCommandBody = <Agg, W, E, A, N, Recorded, Refusal, R>(
  spec: NoticedCommandSpec<Agg, W, E, A, N, Recorded, Refusal, R>
): Effect.Effect<
  A,
  Refusal | SqlError | Schema.SchemaError,
  R | Outbox | Transaction
> =>
  Effect.gen(function* () {
    const outbox = yield* Outbox
    const transaction = yield* Transaction
    const aggregate = yield* spec.load
    const decided = yield* Effect.fromResult(spec.decide(aggregate))
    yield* spec.apply(decided.writes)
    yield* outbox.append(spec.topic, decided.events)
    const recorded = yield* Effect.forEach(decided.notices, spec.notices.record)
    yield* transaction.afterCommit(spec.notices.dispatch(recorded))
    return decided.outcome
  })

/**
 * The two ways a context runs its commands, built once from what every
 * command of the context shares.
 *
 * ```typescript
 * const { run, body } = commandsOf(
 *   { topic: CanopyTopic, apply: store.apply, notices, asError },
 *   context
 * )
 * ```
 */
export const commandsOf = <
  W,
  E,
  N,
  Recorded,
  Refusal extends { readonly _tag: string },
  M extends RefusalTable<Refusal>,
>(
  config: {
    readonly topic: OutboxTopic<E>
    readonly apply: (
      writes: ReadonlyArray<W>
    ) => Effect.Effect<void, SqlError, Transaction>
    readonly notices: Notices<N, Recorded, Transaction>
    readonly asError: RefusalMapper<Refusal, M>
  },
  context: Context.Context<Outbox | SqlClient.SqlClient>
) => {
  /**
   * One command in the transaction of its caller, for a caller that puts
   * more in that transaction. Fails with the refusal itself, and keeps
   * `SqlError` for the caller to handle.
   */
  const body = <Agg, A, F extends Refusal>(
    load: Effect.Effect<Agg, SqlError, Transaction>,
    decide: (aggregate: Agg) => Result.Result<Decision<W, E, A, N>, F>
  ): Effect.Effect<A, F | SqlError, Transaction> =>
    noticedCommandBody({
      topic: config.topic,
      load,
      decide,
      apply: config.apply,
      notices: config.notices,
    }).pipe(Effect.catchTag('SchemaError', Effect.die), Effect.provide(context))

  /**
   * One command in one transaction (a savepoint when the caller already
   * holds one), under the span `name`, `<context>.<command>`. A refusal
   * rolls back and is the only failure, answered as its error. A database
   * error is a defect.
   */
  const run = <Agg, A, F extends Refusal>(
    name: string,
    load: Effect.Effect<Agg, SqlError, Transaction>,
    decide: (aggregate: Agg) => Result.Result<Decision<W, E, A, N>, F>
  ): Effect.Effect<A, ErrorOf<Refusal, M, F>> =>
    transact(body(load, decide)).pipe(
      Effect.catchTag('SqlError', Effect.die),
      Effect.withSpan(name),
      Effect.mapError((refusal: F) => config.asError(refusal)),
      Effect.provide(context)
    )

  return { run, body }
}
