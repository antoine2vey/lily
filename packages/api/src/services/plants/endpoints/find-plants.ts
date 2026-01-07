import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { plants } from '@lily/db'
import type { PlantsListResponse } from '@lily/shared/plant'
import { asc, count, desc } from 'drizzle-orm'
import { Effect } from 'effect'

// Get plants with pagination and filtering
export const findPlants = (params: {
  page?: number
  limit?: number
  filter?: 'needsAttention' | 'all'
  sort?: 'added' | 'name'
}): Effect.Effect<PlantsListResponse, SqlError, PgDrizzle.PgDrizzle> =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle
    const page = params.page ?? 1
    const limit = params.limit ?? 10
    const offset = (page - 1) * limit

    // Get total count
    const countResult = yield* db.select({ value: count() }).from(plants)
    const total = countResult[0]?.value ?? 0

    // Get plants with pagination
    const plantsList = yield* db
      .select()
      .from(plants)
      .offset(offset)
      .limit(limit)
      .orderBy(
        params.sort === 'name' ? asc(plants.name) : desc(plants.dateAdded)
      )

    return {
      plants: plantsList,
      total,
      page,
      limit,
    }
  })
