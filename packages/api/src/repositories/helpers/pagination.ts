import { Array, Option, pipe } from 'effect'

/**
 * Calculate pagination offset and limit from optional page/limit params
 */
export interface PaginationInput {
  page?: number | undefined
  limit?: number | undefined
}

export interface PaginationOutput {
  page: number
  limit: number
  offset: number
}

/**
 * Extract pagination params with defaults
 * @param input - Optional page and limit
 * @param defaultLimit - Default limit if not provided (default: 20)
 * @returns Normalized pagination values with offset
 */
export const getPaginationParams = (
  input: PaginationInput,
  defaultLimit = 20
): PaginationOutput => {
  const page = pipe(
    Option.fromNullable(input.page),
    Option.getOrElse(() => 1)
  )
  const limit = pipe(
    Option.fromNullable(input.limit),
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

/**
 * Extract total count from a count query result
 * @param result - Array with count property (from Drizzle count query)
 * @returns The count value or 0 if not found
 */
export const extractCount = (
  result: ReadonlyArray<{ value: number | null }>
): number =>
  pipe(
    Array.head(result),
    Option.flatMap((r) => Option.fromNullable(r.value)),
    Option.getOrElse(() => 0)
  )
