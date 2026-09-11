import type { SqlError } from '@effect/sql/SqlError'
import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import type { CarePlan } from '@lily/shared/care-plan'
import { Effect } from 'effect'

// Deleting an accepted plan leaves any schedule adjustments made on accept in
// place: the calendar already reflects the advice the user agreed to.
/** `plan` comes from `withCarePlanAuth` in the handler. */
export const deleteCarePlan = (
  plan: CarePlan
): Effect.Effect<{ message: string }, SqlError, CarePlanRepository> =>
  Effect.gen(function* () {
    const repo = yield* CarePlanRepository
    yield* repo.delete(plan.id, plan.userId)
    return { message: `Care plan ${plan.id} deleted successfully` }
  }).pipe(
    Effect.withSpan('CarePlansService.deleteCarePlan', {
      attributes: { 'carePlan.id': plan.id },
    })
  )
