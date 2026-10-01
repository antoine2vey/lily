import { PgClient, PgTypes } from '@effect/sql-pg'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import { count, eq, sql } from 'drizzle-orm'
import { customType, integer, pgTable, text } from 'drizzle-orm/pg-core'
import {
  Array,
  Duration,
  Effect,
  Layer,
  ManagedRuntime,
  Option,
  pipe,
  Redacted,
  Result,
  Schema,
  String,
} from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import { isSqlError } from 'effect/sql/SqlError'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const url = Option.fromUndefinedOr(process.env.TEST_DATABASE_URL)

const suffix = String.replaceAll('-', '_')(crypto.randomUUID())
const plantsName = `effect_drizzle_plants_${suffix}`
const pointsName = `effect_drizzle_points_${suffix}`

const plants = pgTable(plantsName, {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
})

// Stand-in for knowledge-db's halfvec column: a type the client has no
// built-in codec for, whose binary wire format is not its text form.
const point = customType<{
  data: Array<number>
  driverData: string
  driverParam: string
}>({
  dataType: () => 'point',
  toDriver: (value) =>
    `(${Array.join(
      Array.map(value, (n) => `${n}`),
      ','
    )})`,
  fromDriver: (value) =>
    pipe(value, String.slice(1, -1), String.split(','), Array.map(Number)),
})

const points = pgTable(pointsName, {
  id: integer('id').primaryKey(),
  at: point('at').notNull(),
})

const POINT_OID = 600

// Renders a binary point as its text form so fromDriver keeps working.
const pointAsText: PgTypes.Codec<string> = {
  encode: () =>
    Result.fail(new PgTypes.CodecError({ message: 'point is read-only' })),
  decode: (bytes) => {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length)
    return Result.succeed(`(${view.getFloat64(0)},${view.getFloat64(8)})`)
  },
}

const clientLayer = (types?: PgTypes.Registry) =>
  PgDrizzle.layer.pipe(
    Layer.provideMerge(
      PgClient.layer({
        url: Redacted.make(Option.getOrElse(url, () => '')),
        types,
      })
    )
  )

class PlantRejected extends Schema.TaggedError<PlantRejected>()(
  'PlantRejected',
  {}
) {}

const countPlants = Effect.gen(function* () {
  const db = yield* PgDrizzle.PgDrizzle
  const rows = yield* db.select({ value: count() }).from(plants)
  return Array.match(rows, {
    onEmpty: () => -1,
    onNonEmpty: ([row]) => row.value,
  })
})

const plantNames = Effect.gen(function* () {
  const db = yield* PgDrizzle.PgDrizzle
  const rows = yield* db.select({ name: plants.name }).from(plants)
  return Array.map(rows, (row) => row.name)
})

describe.skipIf(Option.isNone(url))('effect-drizzle against Postgres', () => {
  const runtime = ManagedRuntime.make(clientLayer())
  const run = <A, E>(
    effect: Effect.Effect<A, E, PgDrizzle.PgDrizzle | SqlClient.SqlClient>
  ) => runtime.runPromise(effect)

  beforeAll(() =>
    run(
      Effect.gen(function* () {
        const client = yield* SqlClient.SqlClient
        yield* client.unsafe(
          `create table "${plantsName}" (id integer primary key, name text not null)`
        )
        yield* client.unsafe(
          `create table "${pointsName}" (id integer primary key, at point not null)`
        )
      })
    )
  )

  afterAll(async () => {
    await run(
      Effect.gen(function* () {
        const client = yield* SqlClient.SqlClient
        yield* client.unsafe(`drop table if exists "${plantsName}"`)
        yield* client.unsafe(`drop table if exists "${pointsName}"`)
      })
    )
    await runtime.dispose()
  })

  it('returns inserted rows and reads them back', async () => {
    const [inserted, selected] = await run(
      Effect.gen(function* () {
        const db = yield* PgDrizzle.PgDrizzle
        const inserted = yield* db
          .insert(plants)
          .values({ id: 1, name: 'fern' })
          .returning()
        const selected = yield* db.select().from(plants).where(eq(plants.id, 1))
        return [inserted, selected] as const
      })
    )
    expect(inserted).toEqual([{ id: 1, name: 'fern' }])
    expect(selected).toEqual([{ id: 1, name: 'fern' }])
  })

  it('rolls back a transaction that fails, and sees its own writes inside', async () => {
    const outcome = await run(
      Effect.gen(function* () {
        const db = yield* PgDrizzle.PgDrizzle
        const client = yield* SqlClient.SqlClient
        const before = yield* countPlants
        const error = yield* Effect.flip(
          client.withTransaction(
            Effect.gen(function* () {
              yield* db.insert(plants).values({ id: 2, name: 'tx-only' })
              const seen = yield* db
                .select()
                .from(plants)
                .where(eq(plants.id, 2))
              expect(seen).toEqual([{ id: 2, name: 'tx-only' }])
              return yield* new PlantRejected()
            })
          )
        )
        const after = yield* countPlants
        return { before, after, tag: error._tag }
      })
    )
    expect(outcome.tag).toBe('PlantRejected')
    expect(outcome.after).toBe(outcome.before)
  })

  it('keeps a concurrent insert outside a failing transaction', async () => {
    const names = await run(
      Effect.gen(function* () {
        const db = yield* PgDrizzle.PgDrizzle
        const client = yield* SqlClient.SqlClient
        yield* Effect.all(
          [
            client
              .withTransaction(
                Effect.gen(function* () {
                  yield* db.insert(plants).values({ id: 3, name: 'in-tx' })
                  yield* Effect.sleep(Duration.millis(100))
                  return yield* new PlantRejected()
                })
              )
              .pipe(Effect.flip),
            Effect.sleep(Duration.millis(20)).pipe(
              Effect.andThen(
                db.insert(plants).values({ id: 4, name: 'outside-tx' })
              )
            ),
          ],
          { concurrency: 'unbounded' }
        )
        return yield* plantNames
      })
    )
    expect(names).toContain('outside-tx')
    expect(names).not.toContain('in-tx')
  })

  it('surfaces a duplicate key as SqlError with a UniqueViolation reason', async () => {
    const error = await run(
      Effect.gen(function* () {
        const db = yield* PgDrizzle.PgDrizzle
        yield* db.insert(plants).values({ id: 5, name: 'first' })
        return yield* Effect.flip(
          db.insert(plants).values({ id: 5, name: 'second' })
        )
      })
    )
    expect(isSqlError(error)).toBe(true)
    expect(error.reason._tag).toBe('UniqueViolation')
  })

  it('wraps db.execute rows in a one-element array and decodes int8 as bigint', async () => {
    const { raw, viaCount, viaInt } = await run(
      Effect.gen(function* () {
        const db = yield* PgDrizzle.PgDrizzle
        yield* db.delete(plants)
        yield* db.insert(plants).values([
          { id: 10, name: 'a' },
          { id: 11, name: 'b' },
        ])
        const raw = yield* db.execute(
          sql`select count(*) as count from ${plants}`
        )
        const viaCount = yield* db.select({ value: count() }).from(plants)
        const viaInt = yield* db
          .select({ value: sql<number>`count(*)::int` })
          .from(plants)
        return { raw, viaCount, viaInt }
      })
    )
    expect(raw).toEqual([expect.objectContaining({ rows: [{ count: 2n }] })])
    expect(viaCount).toEqual([{ value: 2 }])
    expect(viaInt).toEqual([{ value: 2 }])
  })

  it('decodes a custom column type once its binary codec is registered', async () => {
    const registry = PgTypes.makeRegistry()
    registry.register(POINT_OID, pointAsText)
    const withCodec = ManagedRuntime.make(clientLayer(registry))
    const rows = await withCodec.runPromise(
      Effect.gen(function* () {
        const db = yield* PgDrizzle.PgDrizzle
        yield* db.insert(points).values({ id: 1, at: [1.5, -2] })
        return yield* db.select().from(points)
      })
    )
    await withCodec.dispose()
    expect(rows).toEqual([{ id: 1, at: [1.5, -2] }])
  })

  it('garbles or fails a custom column type without a codec', async () => {
    const { garbled, error } = await run(
      Effect.gen(function* () {
        const db = yield* PgDrizzle.PgDrizzle
        yield* db.insert(points).values([
          { id: 2, at: [3, 4] },
          { id: 3, at: [1.5, -2] },
        ])
        const garbled = yield* db.select().from(points).where(eq(points.id, 2))
        const error = yield* Effect.flip(
          db.select().from(points).where(eq(points.id, 3))
        )
        return { garbled, error }
      })
    )
    expect(garbled).toEqual([{ id: 2, at: [Number.NaN] }])
    expect(error.reason._tag).toBe('UnknownError')
    expect(error.reason.cause).toMatchObject({
      _tag: 'PgTypesCodecError',
      message: 'Invalid UTF-8 in text value',
    })
  })
})
