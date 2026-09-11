import type { SqlError } from '@effect/sql/SqlError'
import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
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

// Clears the step only. A care log written when the step was completed stays
// in the plant's history, mirroring the Care tab where undo is a client-side
// delay rather than a server-side rewind.
export const uncompleteCarePlanStep = (
  planId: string,
  stepId: string
): Effect.Effect<
  CarePlan,
  CarePlanNotFoundError | CarePlanStepNotFoundError | SqlError,
  CarePlanRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* CarePlanRepository
    const { id: userId } = yield* CurrentUser

    const plan = yield* requireOwnedPlan(planId)
    yield* requireStep(plan, stepId)
    yield* repo.uncompleteStep(stepId)

    // A plan that auto-completed reopens when one of its steps is undone.
    const reopened =
      plan.status === 'completed'
        ? yield* repo.updateStatus(planId, userId, {
            status: 'accepted',
            completedAt: null,
          })
        : yield* repo.findById(planId, userId)

    return pipe(
      Option.fromNullable(reopened),
      Option.getOrElse(() => plan)
    )
  }).pipe(
    Effect.withSpan('CarePlansService.uncompleteCarePlanStep', {
      attributes: { 'carePlan.id': planId, 'carePlanStep.id': stepId },
    })
  )
