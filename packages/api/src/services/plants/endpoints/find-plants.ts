import { Database } from '@lily/db'
import { DatabaseError } from '@lily/shared/errors/database'
import type { PlantsListResponse } from '@lily/shared/plant'
import { plantSelector } from '@lily/shared/selectors/plant'
import { Effect } from 'effect'
import { transformPlant } from '../utils'

// Get plants with pagination and filtering
export const findPlants = (params: {
  page?: number
  limit?: number
  filter?: 'needsAttention' | 'all'
  sort?: 'added' | 'name'
}) =>
  Effect.gen(function* () {
    const db = yield* Database
    const page = params.page ?? 1
    const limit = params.limit ?? 10
    const offset = (page - 1) * limit

    yield* Effect.log('Finding plants with pagination')

    // Get total count
    const total = yield* Effect.tryPromise({
      try: () => db.client.plant.count(),
      catch: () => new DatabaseError(),
    })

    // Get plants with pagination
    const rawPlants = yield* Effect.tryPromise({
      try: () =>
        db.client.plant.findMany({
          select: plantSelector,
          skip: offset,
          take: limit,
          orderBy:
            params.sort === 'name' ? { name: 'asc' } : { dateAdded: 'desc' },
        }),
      catch: () => new DatabaseError(),
    })

    const plants = rawPlants.map(transformPlant)

    return {
      plants,
      total,
      page,
      limit,
    } satisfies PlantsListResponse
  })
