import type { SqlError } from '@effect/sql/SqlError'
import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type {
  CarePlanListResponse,
  CarePlanStatus,
} from '@lily/shared/care-plan'
import { Effect } from 'effect'

export const listCarePlans = (
  status?: CarePlanStatus
): Effect.Effect<
  CarePlanListResponse,
  SqlError,
  CarePlanRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* CarePlanRepository
    const { id: userId } = yield* CurrentUser
    const items = yield* repo.findByUser(userId, status)
    return { items }
  }).pipe(Effect.withSpan('CarePlansService.listCarePlans'))
