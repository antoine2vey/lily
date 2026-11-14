import {
  type FindPlantsResult,
  PlantRepository,
} from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import type { PlantFilter, PlantSort } from '@lily/shared'
import { Effect, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

// Get plants with pagination and filtering
export const findPlants = (params: {
  page?: number
  limit?: number
  filter?: PlantFilter
  sort?: PlantSort
  roomId?: string
  includeCaretaking?: boolean
  includeCanopy?: boolean
}): Effect.Effect<FindPlantsResult, SqlError, PlantRepository | CurrentUser> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const { id: userId } = yield* CurrentUser
    return yield* repo.findAll({ ...params, userId })
  }).pipe(
    Effect.withSpan('PlantsService.findPlants', {
      attributes: {
        'plant.filter': pipe(
          Option.fromNullishOr(params.filter),
          Option.getOrElse(() => 'all')
        ),
        'plant.sort': pipe(
          Option.fromNullishOr(params.sort),
          Option.getOrElse(() => 'added')
        ),
      },
    })
  )
