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

export const extractCount = (
  result: ReadonlyArray<{ value: number | null }>
): number =>
  pipe(
    Array.head(result),
    Option.flatMap((r) => Option.fromNullishOr(r.value)),
    Option.getOrElse(() => 0)
  )
