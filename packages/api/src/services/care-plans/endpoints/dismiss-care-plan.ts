import type { SqlError } from '@effect/sql/SqlError'
import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { requireOwnedPlan } from '@lily/api/services/care-plans/helpers/require-owned-plan'
import type { CarePlan } from '@lily/shared/care-plan'
import {
  type CarePlanNotFoundError,
  CarePlanNotProposedError,
} from '@lily/shared/errors/care-plan'
import { Effect, Option, pipe } from 'effect'

export const dismissCarePlan = (
  planId: string
): Effect.Effect<
  CarePlan,
  CarePlanNotFoundError | CarePlanNotProposedError | SqlError,
  CarePlanRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* CarePlanRepository
    const { id: userId } = yield* CurrentUser
    const plan = yield* requireOwnedPlan(planId)
    if (plan.status !== 'proposed') {
      return yield* new CarePlanNotProposedError({
        planId,
        status: plan.status,
      })
    }
    const dismissed = yield* repo.updateStatus(planId, userId, {
      status: 'dismissed',
    })
    return pipe(
      Option.fromNullable(dismissed),
      Option.getOrElse(() => plan)
    )
  }).pipe(
    Effect.withSpan('CarePlansService.dismissCarePlan', {
      attributes: { 'carePlan.id': planId },
    })
  )
