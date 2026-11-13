import { CarePlans } from '@lily/api/contexts/care'
import {
  type CarePlanContext,
  reloadPlan,
} from '@lily/api/services/care-plans/helpers/with-care-plan-auth'
import { Effect } from 'effect'

export const dismissCarePlan = ({ permit }: CarePlanContext<'manage'>) =>
  Effect.gen(function* () {
    const carePlans = yield* CarePlans
    yield* carePlans.dismiss({ permit })
    return yield* reloadPlan(permit.planId)
  }).pipe(
    Effect.withSpan('CarePlansService.dismissCarePlan', {
      attributes: { 'carePlan.id': permit.planId },
    })
  )
