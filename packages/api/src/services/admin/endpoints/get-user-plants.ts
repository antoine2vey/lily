import type { SqlError } from '@effect/sql/SqlError'
import {
  type FindPlantsResult,
  PlantRepository,
} from '@lily/api/repositories/plant.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import { getUser } from '@lily/api/services/admin/endpoints/get-user'
import { type PaginationParams, parsePaginationParams } from '@lily/shared'
import type { UserNotFoundError } from '@lily/shared/errors/user'
import { Effect, Option } from 'effect'

// List a target user's (owned) plants for the admin detail page. Delegates to
// PlantRepository.findAll, which already accepts an arbitrary userId and
// returns the same PlantWithRoom shape the mobile app receives — so the wire
// schema is the existing PlantsListResponse.
export const getUserPlants = (
  userId: string,
  params: PaginationParams
): Effect.Effect<
  FindPlantsResult,
  SqlError | UserNotFoundError,
  UserRepository | PlantRepository
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    // Fetch the user both to 404 on unknown ids and to read the timezone used
    // for overdue-schedule evaluation (target user's local time, not admin's).
    const user = yield* getUser(userId)
    const timezone = Option.getOrElse(
      Option.fromNullable(user.timezone),
      () => 'UTC'
    )
    const { page, limit } = parsePaginationParams(params)

    return yield* repo.findAll({ userId, timezone, page, limit })
  }).pipe(
    Effect.withSpan('AdminService.getUserPlants', {
      attributes: { 'user.id': userId },
    })
  )
