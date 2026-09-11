import type { SqlError } from '@effect/sql/SqlError'
import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import type { CarePlan } from '@lily/shared/care-plan'
import { CarePlanNotProposedError } from '@lily/shared/errors/care-plan'
import { Effect, Option, pipe } from 'effect'

/** `plan` comes from `withCarePlanAuth` in the handler. */
export const dismissCarePlan = (
  plan: CarePlan
): Effect.Effect<
  CarePlan,
  CarePlanNotProposedError | SqlError,
  CarePlanRepository
> =>
  Effect.gen(function* () {
    const repo = yield* CarePlanRepository
    if (plan.status !== 'proposed') {
      return yield* new CarePlanNotProposedError({
        planId: plan.id,
        status: plan.status,
      })
    }
    const dismissed = yield* repo.updateStatus(plan.id, plan.userId, {
      status: 'dismissed',
    })
    return pipe(
      Option.fromNullable(dismissed),
      Option.getOrElse(() => plan)
    )
  }).pipe(
    Effect.withSpan('CarePlansService.dismissCarePlan', {
      attributes: { 'carePlan.id': plan.id },
    })
  )
