import {
  type Consumer,
  ConsumerFailed,
  consumer,
  makeOutbox,
  Outbox,
  topic,
} from '@lily/api/kernel/outbox'
import { transact } from '@lily/api/kernel/transact'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, Duration, Effect, Layer, Queue, Schema } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import pg from 'pg'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

const { Pool } = pg

const DbLive = DrizzleLive.pipe(Layer.provideMerge(PgLive))

const Watered = Schema.Struct({ plantId: Schema.String })
const care = topic('test-care', Watered)

const START = new Date('2026-11-12T10:00:00Z')
const seconds = (n: number) => new Date(START.getTime() + n * 1000)

describe.skipIf(!process.env.DATABASE_URL_TEST)('Outbox - Integration', () => {
  let pool: pg.Pool
  let db: ReturnType<typeof drizzle>

  /** Runs a program against an outbox built for these consumers. */
  const withOutbox = <A, E>(
    consumers: ReadonlyArray<Consumer>,
    use: (
      outbox: Effect.Success<ReturnType<typeof makeOutbox>>['service']
    ) => Effect.Effect<A, E, SqlClient.SqlClient>
  ) =>
    Effect.runPromise(
      makeOutbox(consumers, { maxAttempts: 3 }).pipe(
        Effect.flatMap(({ service }) => use(service)),
        Effect.provide(DbLive)
      )
    )

  const rows = () => db.select().from(schema.outbox).orderBy(schema.outbox.id)

  /** A consumer that records what it receives and fails while told to. */
  const recorder = (name: string) => {
    const seen: Array<string> = []
    const state = { failing: false }
    return {
      seen,
      state,
      consumer: consumer(name, care, (event) =>
        state.failing
          ? Effect.fail(new ConsumerFailed({ consumer: name, reason: 'down' }))
          : Effect.sync(() => {
              seen.push(event.plantId)
            })
      ),
    }
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
    db = drizzle(pool, { schema })
  })

  afterAll(async () => {
    await pool.end()
  })

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(START)
    await db.execute(sql`TRUNCATE TABLE outbox RESTART IDENTITY`)
    await db.execute(sql`TRUNCATE TABLE dead_letter_messages`)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('delivers a committed event to every consumer of its topic', async () => {
    const reminders = recorder('reminders')
    const achievements = recorder('achievements')

    const claimed = await withOutbox(
      [reminders.consumer, achievements.consumer],
      (outbox) =>
        Effect.gen(function* () {
          const sqlClient = yield* SqlClient.SqlClient
          yield* sqlClient.withTransaction(
            outbox.append(care, [{ plantId: 'fern' }, { plantId: 'ivy' }])
          )
          return yield* outbox.drain
        })
    )

    expect(claimed).toBe(2)
    expect(reminders.seen.sort()).toEqual(['fern', 'ivy'])
    expect(achievements.seen.sort()).toEqual(['fern', 'ivy'])
    expect(
      Array.map(await rows(), (r) => [r.pendingConsumers, r.processedAt])
    ).toEqual([
      [[], START],
      [[], START],
    ])
  })

  it('stores nothing when the producer transaction rolls back', async () => {
    const reminders = recorder('reminders')

    await withOutbox([reminders.consumer], (outbox) =>
      Effect.gen(function* () {
        const sqlClient = yield* SqlClient.SqlClient
        yield* sqlClient
          .withTransaction(
            outbox
              .append(care, [{ plantId: 'fern' }])
              .pipe(Effect.andThen(Effect.fail('write failed' as const)))
          )
          .pipe(Effect.exit)
        return yield* outbox.drain
      })
    )

    expect(await rows()).toEqual([])
    expect(reminders.seen).toEqual([])
  })

  it('stores nothing for a topic without a consumer', async () => {
    await withOutbox([], (outbox) => outbox.append(care, [{ plantId: 'fern' }]))

    expect(await rows()).toEqual([])
  })

  it('retries only the consumer that failed, after a backoff', async () => {
    const reminders = recorder('reminders')
    const achievements = recorder('achievements')
    reminders.state.failing = true
    const consumers = [reminders.consumer, achievements.consumer]

    await withOutbox(consumers, (outbox) =>
      outbox
        .append(care, [{ plantId: 'fern' }])
        .pipe(Effect.andThen(outbox.drain))
    )

    expect(achievements.seen).toEqual(['fern'])
    expect(await rows()).toMatchObject([
      {
        pendingConsumers: ['reminders'],
        attempts: 1,
        processedAt: null,
        claimedUntil: null,
        availableAt: seconds(2),
      },
    ])

    // Before the backoff ends the row is not ready.
    reminders.state.failing = false
    vi.setSystemTime(seconds(1))
    expect(await withOutbox(consumers, (outbox) => outbox.drain)).toBe(0)

    vi.setSystemTime(seconds(2))
    expect(await withOutbox(consumers, (outbox) => outbox.drain)).toBe(1)
    expect(reminders.seen).toEqual(['fern'])
    // The consumer that already succeeded is not called again.
    expect(achievements.seen).toEqual(['fern'])
    expect(await rows()).toMatchObject([
      { pendingConsumers: [], processedAt: seconds(2) },
    ])
  })

  it('redelivers a row whose relay died, once its lease has run out', async () => {
    const reminders = recorder('reminders')
    await withOutbox([reminders.consumer], (outbox) =>
      outbox.append(care, [{ plantId: 'fern' }])
    )
    // A relay claimed the row and crashed before delivering it.
    await db
      .update(schema.outbox)
      .set({ claimedUntil: seconds(30), attempts: 1 })

    vi.setSystemTime(seconds(29))
    expect(
      await withOutbox([reminders.consumer], (outbox) => outbox.drain)
    ).toBe(0)

    vi.setSystemTime(seconds(31))
    expect(
      await withOutbox([reminders.consumer], (outbox) => outbox.drain)
    ).toBe(1)
    expect(reminders.seen).toEqual(['fern'])
  })

  it('dead-letters an event after the last attempt and stops retrying', async () => {
    const reminders = recorder('reminders')
    reminders.state.failing = true
    await withOutbox([reminders.consumer], (outbox) =>
      outbox.append(care, [{ plantId: 'fern' }])
    )

    // maxAttempts is 3: each pass runs after the previous backoff.
    for (const at of [0, 2, 6]) {
      vi.setSystemTime(seconds(at))
      await withOutbox([reminders.consumer], (outbox) => outbox.drain)
    }

    const [row] = await rows()
    expect(row).toMatchObject({ attempts: 3, processedAt: seconds(6) })
    expect(await db.select().from(schema.deadLetterMessages)).toMatchObject([
      {
        originalMessageId: String(row?.id),
        topic: 'outbox:test-care:reminders',
        payload: { plantId: 'fern' },
        retryCount: 3,
      },
    ])

    vi.setSystemTime(seconds(3600))
    expect(
      await withOutbox([reminders.consumer], (outbox) => outbox.drain)
    ).toBe(0)
  })

  describe('redrive', () => {
    const deadLetter = async (
      reminders: ReturnType<typeof recorder>,
      plantId: string
    ) => {
      reminders.state.failing = true
      await withOutbox([reminders.consumer], (outbox) =>
        outbox.append(care, [{ plantId }])
      )
      for (const at of [0, 2, 6]) {
        vi.setSystemTime(seconds(at))
        await withOutbox([reminders.consumer], (outbox) => outbox.drain)
      }
      reminders.state.failing = false
    }

    it('delivers a dead-lettered event once its consumer works again', async () => {
      const reminders = recorder('reminders')
      await deadLetter(reminders, 'fern')
      vi.setSystemTime(seconds(3600))

      const revived = await withOutbox([reminders.consumer], (outbox) =>
        outbox.redrive('reminders', Duration.hours(24))
      )
      await withOutbox([reminders.consumer], (outbox) => outbox.drain)

      expect(revived).toBe(1)
      expect(reminders.seen).toEqual(['fern'])
      expect(await rows()).toMatchObject([
        { attempts: 1, pendingConsumers: [], processedAt: seconds(3600) },
      ])
    })

    it('leaves delivered events and other consumers alone', async () => {
      const reminders = recorder('reminders')
      const achievements = recorder('achievements')
      await withOutbox([reminders.consumer, achievements.consumer], (outbox) =>
        Effect.andThen(outbox.append(care, [{ plantId: 'fern' }]), outbox.drain)
      )
      await deadLetter(achievements, 'ivy')

      const revived = await withOutbox(
        [reminders.consumer, achievements.consumer],
        (outbox) => outbox.redrive('reminders', Duration.hours(24))
      )

      expect(revived).toBe(0)
    })

    it('gives up on an event older than the window', async () => {
      const reminders = recorder('reminders')
      await deadLetter(reminders, 'fern')
      vi.setSystemTime(seconds(25 * 3600))

      const revived = await withOutbox([reminders.consumer], (outbox) =>
        outbox.redrive('reminders', Duration.hours(24))
      )

      expect(revived).toBe(0)
      expect(
        await withOutbox([reminders.consumer], (outbox) => outbox.drain)
      ).toBe(0)
    })
  })

  describe('transact', () => {
    const wakesAfter = <E>(
      body: (
        outbox: Effect.Success<ReturnType<typeof makeOutbox>>['service']
      ) => Effect.Effect<unknown, E, SqlClient.SqlClient | Outbox>
    ) =>
      Effect.runPromise(
        makeOutbox([recorder('reminders').consumer]).pipe(
          Effect.flatMap(({ service, wakes }) =>
            body(service).pipe(
              Effect.provideService(Outbox, service),
              Effect.exit,
              Effect.andThen(Queue.size(wakes))
            )
          ),
          Effect.provide(DbLive)
        )
      )

    it('wakes the relay once the transaction has committed', async () => {
      const wakes = await wakesAfter((outbox) =>
        transact(outbox.append(care, [{ plantId: 'fern' }]))
      )

      expect(wakes).toBe(1)
      expect(await rows()).toHaveLength(1)
    })

    it('does not wake the relay when the transaction rolls back', async () => {
      const wakes = await wakesAfter((outbox) =>
        transact(
          Effect.andThen(
            outbox.append(care, [{ plantId: 'fern' }]),
            Effect.fail('refused')
          )
        )
      )

      expect(wakes).toBe(0)
      expect(await rows()).toHaveLength(0)
    })
  })

  it('fails delivery, without dropping it, when an event no longer decodes', async () => {
    const reminders = recorder('reminders')
    await db.insert(schema.outbox).values({
      topic: 'test-care',
      event: { unexpected: true },
      pendingConsumers: ['reminders'],
      availableAt: START,
    })

    await withOutbox([reminders.consumer], (outbox) => outbox.drain)

    expect(reminders.seen).toEqual([])
    expect(await rows()).toMatchObject([
      { pendingConsumers: ['reminders'], attempts: 1, processedAt: null },
    ])
  })

  it('gives each row to one relay when two drain at the same time', async () => {
    const reminders = recorder('reminders')
    await withOutbox([reminders.consumer], (outbox) =>
      outbox.append(
        care,
        Array.makeBy(20, (i) => ({ plantId: `plant-${i}` }))
      )
    )

    const claimed = await Promise.all([
      withOutbox([reminders.consumer], (outbox) => outbox.drain),
      withOutbox([reminders.consumer], (outbox) => outbox.drain),
    ])

    expect(claimed[0] + claimed[1]).toBe(20)
    expect(reminders.seen).toHaveLength(20)
    expect(new Set(reminders.seen).size).toBe(20)
  })
})
