import type { SqlError } from '@effect/sql/SqlError'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import { getUserTimezone } from '@lily/api/services/plants/helpers/user-settings'
import type { PlantsListResponse } from '@lily/shared/plant'
import { Effect } from 'effect'

// Get plants with pagination and filtering
export const findPlants = (params: {
  page?: number
  limit?: number
  filter?: 'needsAttention' | 'overdue' | 'all'
  sort?: 'added' | 'name'
}): Effect.Effect<
  PlantsListResponse,
  SqlError,
  PlantRepository | UserRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const { id: userId } = yield* CurrentUser
    const timezone = yield* getUserTimezone(userId)

    return yield* repo.findAll({ ...params, userId, timezone })
  })
