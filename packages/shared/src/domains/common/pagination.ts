import { Schema } from 'effect'

// Base query params for all paginated endpoints (as strings for URL encoding)
export const PaginationParams = Schema.Struct({
  page: Schema.optionalWith(Schema.String, { default: () => '1' }),
  limit: Schema.optionalWith(Schema.String, { default: () => '20' }),
})

export type PaginationParams = typeof PaginationParams.Type

// Parse pagination params from URL strings to numbers
export const parsePaginationParams = (params: PaginationParams) => ({
  page: parseInt(params.page, 10) || 1,
  limit: parseInt(params.limit, 10) || 20,
})

// Generic paginated response - use `items` for all endpoints
export const PaginatedResponse = <T extends Schema.Schema.Any>(itemSchema: T) =>
  Schema.Struct({
    items: Schema.Array(itemSchema),
    total: Schema.Number,
    page: Schema.Number,
    limit: Schema.Number,
    hasMore: Schema.Boolean,
  })

// Type helper
export type PaginatedResponse<T> = {
  items: readonly T[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

// Helper to build paginated response in repositories/services
export const paginate = <T>(
  items: readonly T[],
  total: number,
  page: number,
  limit: number
): PaginatedResponse<T> => ({
  items,
  total,
  page,
  limit,
  hasMore: page * limit < total,
})
