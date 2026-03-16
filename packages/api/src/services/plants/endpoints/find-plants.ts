import type { SqlError } from '@effect/sql/SqlError'
import {
  type FindPlantsResult,
  PlantRepository,
} from '@lily/api/repositories/plant.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import { getUserTimezone } from '@lily/api/services/plants/helpers/user-settings'
import type { PlantFilter, PlantSort } from '@lily/shared'
import { Effect, Option, pipe } from 'effect'

// Get plants with pagination and filtering
export const findPlants = (params: {
  page?: number
  limit?: number
  filter?: PlantFilter
  sort?: PlantSort
  roomId?: string
  includeCaretaking?: boolean
}): Effect.Effect<
  FindPlantsResult,
  SqlError,
  PlantRepository | UserRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const { id: userId } = yield* CurrentUser
    const timezone = yield* getUserTimezone(userId)

    return yield* repo.findAll({ ...params, userId, timezone })
  }).pipe(
    Effect.withSpan('PlantsService.findPlants', {
      attributes: {
        'plant.filter': pipe(
          Option.fromNullable(params.filter),
          Option.getOrElse(() => 'all')
        ),
        'plant.sort': pipe(
          Option.fromNullable(params.sort),
          Option.getOrElse(() => 'added')
        ),
      },
    })
  )
