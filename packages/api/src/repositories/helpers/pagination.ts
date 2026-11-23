import { Array, Option, pipe } from 'effect'

export interface PaginationInput {
  page?: number | undefined
  limit?: number | undefined
}

export interface PaginationOutput {
  page: number
  limit: number
  offset: number
}

export const getPaginationParams = (
  input: PaginationInput,
  defaultLimit = 20
): PaginationOutput => {
  const page = pipe(
    Option.fromNullishOr(input.page),
    Option.getOrElse(() => 1)
  )
  const limit = pipe(
    Option.fromNullishOr(input.limit),
    Option.getOrElse(() => defaultLimit)
  )
  const offset = (page - 1) * limit

  return { page, limit, offset }
}

/**
 * Unwrap rows from a raw db.execute() result.
 * @effect/sql-drizzle/Pg wraps the pg QueryResult in an outer array when using
 * db.execute() — the actual rows live at result[0].rows.
 */
export const unwrapPgRows = <T>(result: unknown): ReadonlyArray<T> =>
  pipe(
    result as ReadonlyArray<{ rows: T[] }>,
    Array.head,
    Option.map((qr) => qr.rows as ReadonlyArray<T>),
    Option.getOrElse((): ReadonlyArray<T> => [])
  )

export const extractCount = (
  result: ReadonlyArray<{ value: number | null }>
): number =>
  pipe(
    Array.head(result),
    Option.flatMap((r) => Option.fromNullishOr(r.value)),
    Option.getOrElse(() => 0)
  )
