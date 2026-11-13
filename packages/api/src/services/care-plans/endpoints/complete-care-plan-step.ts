import { CarePlans } from '@lily/api/contexts/care'
import {
  type CarePlanStepContext,
  reloadPlan,
} from '@lily/api/services/care-plans/helpers/with-care-plan-auth'
import { Effect } from 'effect'

export const completeCarePlanStep = ({
  permit,
  step: { id: stepId },
}: CarePlanStepContext<'tick'>) =>
  Effect.gen(function* () {
    const carePlans = yield* CarePlans
    yield* carePlans.tickStep({ permit, stepId })
    return yield* reloadPlan(permit.planId)
  }).pipe(
    Effect.withSpan('CarePlansService.completeCarePlanStep', {
      attributes: { 'carePlan.id': permit.planId, 'carePlanStep.id': stepId },
    })
  )
