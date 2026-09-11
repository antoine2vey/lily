import type { SqlError } from '@effect/sql/SqlError'
import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { CarePlan, CarePlanStep } from '@lily/shared/care-plan'
import {
  CarePlanNotFoundError,
  CarePlanStepNotFoundError,
} from '@lily/shared/errors/care-plan'
import { Array, Effect, Option } from 'effect'

/** Loads a plan owned by the current user or fails with a 404-style error. */
export const requireOwnedPlan = (
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
  })

export const requireStep = (
  plan: CarePlan,
  stepId: string
): Effect.Effect<CarePlanStep, CarePlanStepNotFoundError> =>
  Option.match(
    Array.findFirst(plan.steps, (s) => s.id === stepId),
    {
      onNone: () => new CarePlanStepNotFoundError({ stepId }),
      onSome: (s) => Effect.succeed(s),
    }
  )
