import { CarePlans } from '@lily/api/contexts/care'
import { transact } from '@lily/api/kernel/transact'
import {
  type CarePlanStepContext,
  reloadPlan,
} from '@lily/api/services/care-plans/helpers/with-care-plan-auth'
import { Effect } from 'effect'

export const deleteCarePlanStep = ({
  permit,
  step: { id: stepId },
}: CarePlanStepContext<'manage'>) =>
  transact(
    Effect.gen(function* () {
      const carePlans = yield* CarePlans
      yield* carePlans.dropStep({ permit, stepId })
      return yield* reloadPlan(permit.planId)
    })
  ).pipe(
    Effect.withSpan('CarePlansService.deleteCarePlanStep', {
      attributes: { 'carePlan.id': permit.planId, 'carePlanStep.id': stepId },
    })
  )
