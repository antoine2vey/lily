import { Care, CareWhen, PlanStepChoice } from '@lily/api/contexts/care'
import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import type { CarePlanStepContext } from '@lily/api/services/care-plans/helpers/with-care-plan-auth'
import { nowAsDate } from '@lily/shared'
import { CarePlanNotFoundError } from '@lily/shared/errors/care-plan'
import { Effect, Option, pipe } from 'effect'

export const completeCarePlanStep = ({
  plan,
  step,
  carePermit,
}: CarePlanStepContext) =>
  Effect.gen(function* () {
    const repo = yield* CarePlanRepository
    const care = yield* Care

    if (Option.isSome(Option.fromNullishOr(step.completedAt))) {
      return plan
    }

    const tickDirectly = Effect.asVoid(
      repo.completeStep(step.id, { completedAt: nowAsDate() })
    )

    yield* pipe(
      Option.fromNullishOr(step.careType),
      Option.match({
        onNone: () => tickDirectly,
        onSome: (careType) =>
          care
            .recordOne({
              permit: carePermit,
              careType,
              on: CareWhen.Today(),
              notes: Option.none(),
              photoUrl: Option.none(),
              planStep: PlanStepChoice.Step({ id: step.id }),
            })
            .pipe(
              Effect.asVoid,
              Effect.catchTag('AlreadyCaredTodayError', () => tickDirectly),
              Effect.catchTag('PlantIsDeadError', () => tickDirectly),
              Effect.catchTag('FutureDateNotAllowedError', Effect.die),
              Effect.catchTag(
                'PlantNotFoundError',
                () => new CarePlanNotFoundError({ planId: plan.id })
              )
            ),
      })
    )

    const settled = yield* repo.settleCompletion(plan.id)
    return pipe(
      Option.fromNullishOr(settled),
      Option.getOrElse(() => plan)
    )
  }).pipe(
    Effect.withSpan('CarePlansService.completeCarePlanStep', {
      attributes: { 'carePlan.id': plan.id, 'carePlanStep.id': step.id },
    })
  )
