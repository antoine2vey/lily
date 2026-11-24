import { Effect, Schema } from 'effect'

// The bridge answers db.execute with [QueryResult] (packages/db/src/effect-drizzle.ts).
const decodeResult =
  <A>(rows: Schema.Decoder<A>) =>
  <E, R>(execute: Effect.Effect<unknown, E, R>): Effect.Effect<A, E, R> =>
    Effect.flatMap(execute, (result) =>
      Schema.decodeUnknownEffect(Schema.Tuple([Schema.Struct({ rows })]))(
        result
      ).pipe(
        Effect.map(([decoded]) => decoded.rows),
        Effect.orDie
      )
    )

/**
 * Decodes the rows of a raw `db.execute(sql`...`)`. A row that does not match
 * `row` is a defect: the query broke its contract with the code reading it.
 *
 * The schema names what the driver returns: `count(*)` is an int8 and arrives
 * as a `bigint` unless the query casts it with `::int`, `numeric` arrives as a
 * string, `date` and `to_char` as strings, `timestamptz` as a `Date`.
 */
export const queryRows = <A>(row: Schema.Decoder<A>) =>
  decodeResult(Schema.Array(row))

/**
 * Decodes the one row of a raw query that always returns exactly one, such
 * as an aggregate with no `GROUP BY`. Any other row count is a defect.
 */
export const queryOne = <A>(row: Schema.Decoder<A>) => {
  const one = decodeResult(Schema.Tuple([row]))
  return <E, R>(
    execute: Effect.Effect<unknown, E, R>
  ): Effect.Effect<A, E, R> => Effect.map(one(execute), ([decoded]) => decoded)
}
