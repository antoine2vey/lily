import type { SqlError } from '@effect/sql/SqlError'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { toVacationState } from '@lily/api/services/vacation/helpers/vacation-state'
import type { VacationState } from '@lily/shared'
import { UserNotFoundError } from '@lily/shared/errors/user'
import { Effect } from 'effect'

export const getVacation = (): Effect.Effect<
  VacationState,
  SqlError | UserNotFoundError,
  UserRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const { id } = yield* CurrentUser
    const userRepo = yield* UserRepository
    const user = yield* userRepo.findById(id)

    if (!user) {
      return yield* new UserNotFoundError()
    }

    return toVacationState(user)
  }).pipe(Effect.withSpan('VacationService.getVacation'))
