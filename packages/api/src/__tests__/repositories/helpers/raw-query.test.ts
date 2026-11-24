import { queryOne, queryRows } from '@lily/api/repositories/helpers/raw-query'
import { defectOf, failureOf } from '@lily/shared/testing'
import { Effect, Schema } from 'effect'
import { SqlError, UnknownError } from 'effect/sql/SqlError'
import { describe, expect, it } from 'vitest'

// What db.execute returns through the bridge: one QueryResult around the rows.
const executed = (rows: ReadonlyArray<unknown>) =>
  Effect.succeed([{ rows, command: 'SELECT', rowCount: rows.length }])

const Row = Schema.Struct({
  day: Schema.String,
  n: Schema.Finite,
  median: Schema.NullOr(Schema.Finite),
})

describe('queryRows', () => {
  it('decodes every row of the result', async () => {
    const rows = await Effect.runPromise(
      executed([
        { day: '2026-11-01', n: 3, median: null },
        { day: '2026-11-02', n: 5, median: 1.5 },
      ]).pipe(queryRows(Row))
    )

    expect(rows).toEqual([
      { day: '2026-11-01', n: 3, median: null },
      { day: '2026-11-02', n: 5, median: 1.5 },
    ])
  })

  it('decodes a numeric column, which the driver returns as a string', async () => {
    const rows = await Effect.runPromise(
      executed([{ total: '12.50' }]).pipe(
        queryRows(Schema.Struct({ total: Schema.FiniteFromString }))
      )
    )

    expect(rows).toEqual([{ total: 12.5 }])
  })

  it('dies on an uncast count(*), which the driver returns as a bigint', async () => {
    const exit = await Effect.runPromiseExit(
      executed([{ day: '2026-11-01', n: 3n, median: null }]).pipe(
        queryRows(Row)
      )
    )

    expect(defectOf(exit)).toBeInstanceOf(Schema.SchemaError)
  })

  it('dies on a row missing a column', async () => {
    const exit = await Effect.runPromiseExit(
      executed([{ day: '2026-11-01', median: null }]).pipe(queryRows(Row))
    )

    expect(defectOf(exit)).toBeInstanceOf(Schema.SchemaError)
  })

  it('dies on a result that is not one QueryResult', async () => {
    const exit = await Effect.runPromiseExit(
      Effect.succeed([{ day: '2026-11-01', n: 3, median: null }]).pipe(
        queryRows(Row)
      )
    )

    expect(defectOf(exit)).toBeInstanceOf(Schema.SchemaError)
  })

  it('keeps a failed query a typed SqlError', async () => {
    const sqlError = new SqlError({
      reason: new UnknownError({ cause: 'down', message: 'down' }),
    })
    const exit = await Effect.runPromiseExit(
      Effect.fail(sqlError).pipe(queryRows(Row))
    )

    expect(failureOf(exit)).toBe(sqlError)
  })
})

describe('queryOne', () => {
  it('returns the single row', async () => {
    const row = await Effect.runPromise(
      executed([{ day: '2026-11-01', n: 3, median: 2 }]).pipe(queryOne(Row))
    )

    expect(row).toEqual({ day: '2026-11-01', n: 3, median: 2 })
  })

  it('dies on an empty result', async () => {
    const exit = await Effect.runPromiseExit(executed([]).pipe(queryOne(Row)))

    expect(defectOf(exit)).toBeInstanceOf(Schema.SchemaError)
  })

  it('dies on more than one row', async () => {
    const exit = await Effect.runPromiseExit(
      executed([
        { day: '2026-11-01', n: 3, median: null },
        { day: '2026-11-02', n: 4, median: null },
      ]).pipe(queryOne(Row))
    )

    expect(defectOf(exit)).toBeInstanceOf(Schema.SchemaError)
  })
})
