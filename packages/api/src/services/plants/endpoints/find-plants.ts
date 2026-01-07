import type { SqlError } from '@effect/sql/SqlError'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import type { PlantsListResponse } from '@lily/shared/plant'
import { Effect } from 'effect'

// Get plants with pagination and filtering
export const findPlants = (params: {
  page?: number
  limit?: number
  filter?: 'needsAttention' | 'all'
  sort?: 'added' | 'name'
}): Effect.Effect<PlantsListResponse, SqlError, PlantRepository> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    return yield* repo.findAll(params)
  })
