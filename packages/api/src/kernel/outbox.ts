/**
 * Transactional outbox: how one context reacts to another's writes.
 *
 * A producer calls `append` inside its own transaction, so an event exists if
 * and only if the writes it describes do. The relay delivers each event to
 * every consumer of its topic, at least once and in no guaranteed order.
 * Consumers must therefore be idempotent and rebuild from current state.
 */
import * as PgDrizzle from '@lily/db/effect-drizzle'
import { deadLetterMessages, outbox } from '@lily/db/schema'
import { and, asc, eq, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm'
import {
  Array,
  Cause,
  Context,
  DateTime,
  Duration,
  Effect,
  Exit,
  Layer,
  Option,
  pipe,
  Queue,
  Schema,
} from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export interface OutboxTopic<E> {
  readonly name: string
  readonly schema: Schema.Codec<E, unknown>
}

export const topic = <E>(
  name: string,
  schema: Schema.Codec<E, unknown>
): OutboxTopic<E> => ({ name, schema })

export class ConsumerFailed extends Schema.TaggedError<ConsumerFailed>()(
  'ConsumerFailed',
  { consumer: Schema.String, reason: Schema.String }
) {
  override get message() {
    return this.reason
  }

  static readonly because = (consumer: string, error: unknown) =>
    new ConsumerFailed({ consumer, reason: Cause.pretty(Cause.fail(error)) })
}

export interface Consumer {
  readonly name: string
  readonly topic: string
  readonly handle: (event: unknown) => Effect.Effect<void, ConsumerFailed>
}

/**
 * A named consumer of one topic. An event that no longer decodes fails the
 * delivery, so it is retried and then dead-lettered, never dropped.
 */
export const consumer = <E>(
  name: string,
  from: OutboxTopic<E>,
  handle: (event: E) => Effect.Effect<void, ConsumerFailed>
): Consumer => ({
  name,
  topic: from.name,
  handle: (event) =>
    Schema.decodeUnknownEffect(from.schema)(event).pipe(
      Effect.mapError((error) => ConsumerFailed.because(name, error)),
      Effect.flatMap(handle)
    ),
})

export interface RelayConfig {
  readonly pollEvery: Duration.Duration
  /** How long a claimed row is hidden from other relays. */
  readonly lease: Duration.Duration
  readonly batch: number
  /** Deliveries tried before the row goes to `dead_letter_messages`. */
  readonly maxAttempts: number
}

export const defaultRelayConfig: RelayConfig = {
  pollEvery: Duration.seconds(5),
  lease: Duration.seconds(30),
  batch: 50,
  maxAttempts: 8,
}

const MAX_BACKOFF = Duration.minutes(10)

export const backoff = (attempts: number): Duration.Duration =>
  Duration.min(Duration.seconds(2 ** attempts), MAX_BACKOFF)

export class Outbox extends Context.Service<
  Outbox,
  {
    /**
     * Records events in the caller's transaction, one row per event, for the
     * consumers registered on the topic. Without a consumer nothing is stored.
     */
    readonly append: <E>(
      to: OutboxTopic<E>,
      events: ReadonlyArray<E>
    ) => Effect.Effect<void, SqlError | Schema.SchemaError>
    /** Asks the relay to deliver now instead of at its next poll. */
    readonly wake: Effect.Effect<void>
    /**
     * One relay pass: claims ready rows, delivers them, and records the
     * outcome. Returns the number of rows claimed. Safe to run concurrently
     * from several processes.
     */
    readonly drain: Effect.Effect<number, SqlError>
  }
>()('kernel/Outbox') {}

type OutboxRow = typeof outbox.$inferSelect

export const makeOutbox = (
  consumers: ReadonlyArray<Consumer>,
  overrides: Partial<RelayConfig> = {}
) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle
    const config = { ...defaultRelayConfig, ...overrides }
    const wakes = yield* Queue.sliding<void>(1)

    const consumersOf = (topicName: string) =>
      Array.filter(consumers, (c) => c.topic === topicName)

    const claim = Effect.fn('Outbox.claim')(function* (now: DateTime.Utc) {
      const at = DateTime.toDateUtc(now)
      const ready = db
        .select({ id: outbox.id })
        .from(outbox)
        .where(
          and(
            isNull(outbox.processedAt),
            lte(outbox.availableAt, at),
            or(isNull(outbox.claimedUntil), lt(outbox.claimedUntil, at))
          )
        )
        .orderBy(asc(outbox.id))
        .limit(config.batch)
        .for('update', { skipLocked: true })
      return yield* db
        .update(outbox)
        .set({
          claimedUntil: DateTime.toDateUtc(
            DateTime.addDuration(now, config.lease)
          ),
          attempts: sql`${outbox.attempts} + 1`,
        })
        .where(inArray(outbox.id, ready))
        .returning()
    })

    const deliver = (row: OutboxRow, name: string) =>
      pipe(
        Array.findFirst(consumers, (c) => c.name === name),
        Option.match({
          onNone: () =>
            Effect.fail(
              new ConsumerFailed({
                consumer: name,
                reason: 'no consumer is registered under this name',
              })
            ),
          onSome: (c) => c.handle(row.event),
        }),
        Effect.exit,
        Effect.flatMap((exit) =>
          Exit.isSuccess(exit)
            ? db
                .update(outbox)
                .set({
                  pendingConsumers: sql`array_remove(${outbox.pendingConsumers}, ${name})`,
                })
                .where(eq(outbox.id, row.id))
                .pipe(Effect.as(Option.none<{ name: string; error: string }>()))
            : Effect.succeed(
                Option.some({ name, error: Cause.pretty(exit.cause) })
              )
        )
      )

    const settle = Effect.fn('Outbox.settle')(function* (
      row: OutboxRow,
      now: DateTime.Utc
    ) {
      const failures = Array.getSomes(
        yield* Effect.forEach(row.pendingConsumers, (name) =>
          deliver(row, name)
        )
      )
      const at = DateTime.toDateUtc(now)
      if (!Array.isArrayNonEmpty(failures)) {
        yield* db
          .update(outbox)
          .set({ processedAt: at, claimedUntil: null })
          .where(eq(outbox.id, row.id))
        return
      }
      const lastError = Array.join(
        Array.map(failures, (f) => `${f.name}: ${f.error}`),
        '\n'
      )
      if (row.attempts >= config.maxAttempts) {
        yield* db.insert(deadLetterMessages).values(
          Array.map(failures, (failure) => ({
            originalMessageId: String(row.id),
            topic: `outbox:${row.topic}:${failure.name}`,
            payload: row.event,
            error: failure.error,
            retryCount: row.attempts,
          }))
        )
        yield* db
          .update(outbox)
          .set({ processedAt: at, claimedUntil: null, lastError })
          .where(eq(outbox.id, row.id))
        yield* Effect.logError('[outbox] Event dead-lettered', {
          outboxId: row.id,
          topic: row.topic,
          consumers: Array.map(failures, (f) => f.name),
        })
        return
      }
      yield* db
        .update(outbox)
        .set({
          availableAt: DateTime.toDateUtc(
            DateTime.addDuration(now, backoff(row.attempts))
          ),
          claimedUntil: null,
          lastError,
        })
        .where(eq(outbox.id, row.id))
    })

    const service = Outbox.of({
      append: Effect.fn('Outbox.append')(function* <E>(
        to: OutboxTopic<E>,
        events: ReadonlyArray<E>
      ) {
        const pendingConsumers = Array.map(consumersOf(to.name), (c) => c.name)
        if (
          !Array.isArrayNonEmpty(pendingConsumers) ||
          Array.isReadonlyArrayEmpty(events)
        )
          return
        const encoded = yield* Effect.forEach(events, (event) =>
          Schema.encodeUnknownEffect(to.schema)(event)
        )
        const availableAt = DateTime.toDateUtc(yield* DateTime.now)
        yield* db.insert(outbox).values(
          Array.map(encoded, (event) => ({
            topic: to.name,
            event,
            pendingConsumers,
            availableAt,
          }))
        )
      }),
      wake: Queue.offer(wakes, undefined).pipe(Effect.asVoid),
      drain: Effect.gen(function* () {
        const now = yield* DateTime.now
        const rows = yield* claim(now)
        yield* Effect.forEach(rows, (row) => settle(row, now), {
          concurrency: 4,
          discard: true,
        })
        return Array.length(rows)
      }).pipe(Effect.withSpan('Outbox.drain')),
    })
    return { service, wakes, config }
  })

/**
 * The outbox and its relay: one fiber per process that delivers on `wake` and
 * otherwise every `pollEvery`. A crash between a producer's commit and the
 * delivery loses nothing; the row is picked up by the next pass of any relay
 * once its lease has run out.
 */
export const OutboxLive = (
  consumers: ReadonlyArray<Consumer>,
  overrides: Partial<RelayConfig> = {}
): Layer.Layer<Outbox, never, PgDrizzle.PgDrizzle> =>
  Layer.effect(
    Outbox,
    Effect.gen(function* () {
      const { service, wakes, config } = yield* makeOutbox(consumers, overrides)
      const pass = service.drain.pipe(
        Effect.repeat({ while: (claimed) => claimed >= config.batch }),
        Effect.catchCause((cause) =>
          Effect.logError('[outbox] Relay pass failed', {
            cause: Cause.pretty(cause),
          })
        )
      )
      yield* Effect.forkScoped(
        Effect.forever(
          pass.pipe(
            Effect.andThen(
              Effect.race(Queue.take(wakes), Effect.sleep(config.pollEvery))
            )
          )
        )
      )
      return service
    })
  )
