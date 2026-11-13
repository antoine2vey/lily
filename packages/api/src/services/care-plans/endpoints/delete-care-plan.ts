import { CarePlans } from '@lily/api/contexts/care'
import type { CarePlanContext } from '@lily/api/services/care-plans/helpers/with-care-plan-auth'
import { Effect } from 'effect'

// Deleting an accepted plan leaves any schedule adjustments made on accept in
// place: the calendar already reflects the advice the user agreed to.
export const deleteCarePlan = ({ permit }: CarePlanContext<'manage'>) =>
  Effect.gen(function* () {
    const carePlans = yield* CarePlans
    yield* carePlans.delete({ permit })
    return { message: `Care plan ${permit.planId} deleted successfully` }
  }).pipe(
    Effect.withSpan('CarePlansService.deleteCarePlan', {
      attributes: { 'carePlan.id': permit.planId },
    })
  )
