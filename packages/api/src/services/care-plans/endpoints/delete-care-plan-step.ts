import type { SqlError } from '@effect/sql/SqlError'
import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import type { CurrentUser } from '@lily/api/services/auth/middleware.types'
import {
  requireOwnedPlan,
  requireStep,
} from '@lily/api/services/care-plans/helpers/require-owned-plan'
import type { CarePlan } from '@lily/shared/care-plan'
import type {
  CarePlanNotFoundError,
  CarePlanStepNotFoundError,
} from '@lily/shared/errors/care-plan'
import { Effect, Option, pipe } from 'effect'

export const deleteCarePlanStep = (
  planId: string,
  stepId: string
): Effect.Effect<
  CarePlan,
  CarePlanNotFoundError | CarePlanStepNotFoundError | SqlError,
  CarePlanRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* CarePlanRepository
    const plan = yield* requireOwnedPlan(planId)
    yield* requireStep(plan, stepId)
    yield* repo.deleteStep(stepId)
    // Removing the last open step can finish the plan.
    const settled = yield* repo.settleCompletion(planId)
    return pipe(
      Option.fromNullable(settled),
      Option.getOrElse(() => plan)
    )
  }).pipe(
    Effect.withSpan('CarePlansService.deleteCarePlanStep', {
      attributes: { 'carePlan.id': planId, 'carePlanStep.id': stepId },
    })
  )
