import type { SqlError } from '@effect/sql/SqlError'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import type { PlantsListResponse } from '@lily/shared/plant'
import { Effect, Option, pipe } from 'effect'

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
    const userRepo = yield* UserRepository
    const { id: userId } = yield* CurrentUser

    const user = yield* userRepo.findById(userId)
    const timezone = pipe(
      Option.fromNullable(user),
      Option.flatMap((u) => Option.fromNullable(u.timezone)),
      Option.getOrElse(() => 'UTC')
    )

    return yield* repo.findAll({ ...params, userId, timezone })
  })
