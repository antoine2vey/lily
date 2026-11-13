import { CarePlans } from '@lily/api/contexts/care'
import { transact } from '@lily/api/kernel/transact'
import {
  type CarePlanStepContext,
  reloadPlan,
} from '@lily/api/services/care-plans/helpers/with-care-plan-auth'
import { Effect } from 'effect'

export const uncompleteCarePlanStep = ({
  permit,
  step: { id: stepId },
}: CarePlanStepContext<'tick'>) =>
  transact(
    Effect.gen(function* () {
      const carePlans = yield* CarePlans
      yield* carePlans.untickStep({ permit, stepId })
      return yield* reloadPlan(permit.planId)
    })
  ).pipe(
    Effect.withSpan('CarePlansService.uncompleteCarePlanStep', {
      attributes: { 'carePlan.id': permit.planId, 'carePlanStep.id': stepId },
    })
  )
