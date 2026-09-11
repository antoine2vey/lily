import type { SqlError } from '@effect/sql/SqlError'
import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { CarePlan, CarePlanStep } from '@lily/shared/care-plan'
import {
  CarePlanNotFoundError,
  CarePlanStepNotFoundError,
} from '@lily/shared/errors/care-plan'
import { Array, Effect, Option } from 'effect'

/**
 * Loads a plan owned by the current user or fails with a 404-style error.
 * Composed in the handler (like `withPlantAuth`): endpoints receive the plan
 * and must not re-fetch it.
 */
export const withCarePlanAuth = (
  planId: string
): Effect.Effect<
  CarePlan,
  CarePlanNotFoundError | SqlError,
  CarePlanRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* CarePlanRepository
    const { id: userId } = yield* CurrentUser
    const plan = yield* repo.findById(planId, userId)
    return yield* Option.match(Option.fromNullable(plan), {
      onNone: () => new CarePlanNotFoundError({ planId }),
      onSome: (p) => Effect.succeed(p),
    })
  }).pipe(
    Effect.withSpan('withCarePlanAuth', {
      attributes: { 'carePlan.id': planId },
    })
  )

export interface CarePlanStepContext {
  readonly plan: CarePlan
  readonly step: CarePlanStep
}

/** `withCarePlanAuth` plus the step, which must belong to that plan. */
export const withCarePlanStep = (
  planId: string,
  stepId: string
): Effect.Effect<
  CarePlanStepContext,
  CarePlanNotFoundError | CarePlanStepNotFoundError | SqlError,
  CarePlanRepository | CurrentUser
> =>
  withCarePlanAuth(planId).pipe(
    Effect.flatMap((plan) =>
      Option.match(
        Array.findFirst(plan.steps, (s) => s.id === stepId),
        {
          onNone: () => new CarePlanStepNotFoundError({ stepId }),
          onSome: (step) => Effect.succeed({ plan, step }),
        }
      )
    )
  )
