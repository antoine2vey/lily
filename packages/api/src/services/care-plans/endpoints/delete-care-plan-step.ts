import type { SqlError } from '@effect/sql/SqlError'
import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import type { CarePlanStepContext } from '@lily/api/services/care-plans/helpers/with-care-plan-auth'
import type { CarePlan } from '@lily/shared/care-plan'
import { Effect, Option, pipe } from 'effect'

/** `{ plan, step }` come from `withCarePlanStep` in the handler. */
export const deleteCarePlanStep = ({
  plan,
  step,
}: CarePlanStepContext): Effect.Effect<
  CarePlan,
  SqlError,
  CarePlanRepository
> =>
  Effect.gen(function* () {
    const repo = yield* CarePlanRepository
    yield* repo.deleteStep(step.id)
    // Removing the last open step can finish the plan.
    const settled = yield* repo.settleCompletion(plan.id)
    return pipe(
      Option.fromNullable(settled),
      Option.getOrElse(() => plan)
    )
  }).pipe(
    Effect.withSpan('CarePlansService.deleteCarePlanStep', {
      attributes: { 'carePlan.id': plan.id, 'carePlanStep.id': step.id },
    })
  )
