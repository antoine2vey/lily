import type { SqlError } from '@effect/sql/SqlError'
import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import type { CarePlanStepContext } from '@lily/api/services/care-plans/helpers/with-care-plan-auth'
import type { CarePlan } from '@lily/shared/care-plan'
import { Effect, Option, pipe } from 'effect'

// Clears the step only. A care log written when the step was completed stays
// in the plant's history, mirroring the Care tab where undo is a client-side
// delay rather than a server-side rewind.
/** `{ plan, step }` come from `withCarePlanStep` in the handler. */
export const uncompleteCarePlanStep = ({
  plan,
  step,
}: CarePlanStepContext): Effect.Effect<
  CarePlan,
  SqlError,
  CarePlanRepository
> =>
  Effect.gen(function* () {
    const repo = yield* CarePlanRepository
    yield* repo.uncompleteStep(step.id)

    // A plan that auto-completed reopens when one of its steps is undone.
    const reopened =
      plan.status === 'completed'
        ? yield* repo.updateStatus(plan.id, plan.userId, {
            status: 'accepted',
            completedAt: null,
          })
        : yield* repo.findById(plan.id, plan.userId)

    return pipe(
      Option.fromNullable(reopened),
      Option.getOrElse(() => plan)
    )
  }).pipe(
    Effect.withSpan('CarePlansService.uncompleteCarePlanStep', {
      attributes: { 'carePlan.id': plan.id, 'carePlanStep.id': step.id },
    })
  )
