import type { SqlError } from '@effect/sql/SqlError'
import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { requireOwnedPlan } from '@lily/api/services/care-plans/helpers/require-owned-plan'
import type { CarePlanNotFoundError } from '@lily/shared/errors/care-plan'
import { Effect } from 'effect'

// Deleting an accepted plan leaves any schedule adjustments made on accept in
// place: the calendar already reflects the advice the user agreed to.
export const deleteCarePlan = (
  planId: string
): Effect.Effect<
  { message: string },
  CarePlanNotFoundError | SqlError,
  CarePlanRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* CarePlanRepository
    const { id: userId } = yield* CurrentUser
    yield* requireOwnedPlan(planId)
    yield* repo.delete(planId, userId)
    return { message: `Care plan ${planId} deleted successfully` }
  }).pipe(
    Effect.withSpan('CarePlansService.deleteCarePlan', {
      attributes: { 'carePlan.id': planId },
    })
  )
