import { CarePlans } from '@lily/api/contexts/care'
import { transact } from '@lily/api/kernel/transact'
import {
  type CarePlanContext,
  reloadPlan,
} from '@lily/api/services/care-plans/helpers/with-care-plan-auth'
import { Effect } from 'effect'

export const acceptCarePlan = ({ permit }: CarePlanContext<'manage'>) =>
  transact(
    Effect.gen(function* () {
      const carePlans = yield* CarePlans
      yield* carePlans.accept({ permit })
      return yield* reloadPlan(permit.planId)
    })
  ).pipe(
    Effect.withSpan('CarePlansService.acceptCarePlan', {
      attributes: { 'carePlan.id': permit.planId },
    })
  )
