import { Care, DueMove } from '@lily/api/contexts/care'
import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import type { CarePlanContext } from '@lily/api/services/care-plans/helpers/with-care-plan-auth'
import { type CareType, nowAsDate } from '@lily/shared'
import type { CarePlan, CarePlanStep } from '@lily/shared/care-plan'
import { CarePlanNotProposedError } from '@lily/shared/errors/care-plan'
import {
  Array,
  DateTime,
  Effect,
  Filter,
  Option,
  Order,
  pipe,
  Record,
} from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

interface DatedCareStep {
  readonly careType: CareType
  readonly dueDate: Date
}

const dueDateOrder: Order.Order<DatedCareStep> = Order.mapInput(
  Order.Date,
  (s: DatedCareStep) => s.dueDate
)

/**
 * Schedule bridging: one target date per care type, the earliest dated step
 * wins. Steps without a care type or a due date are plain checklist items.
 */
export const scheduleTargetsFromSteps = (
  steps: ReadonlyArray<CarePlanStep>
): ReadonlyArray<DatedCareStep> =>
  pipe(
    steps,
    Array.filterMap(
      Filter.fromPredicateOption((step) =>
        Option.all({
          careType: Option.fromNullishOr(step.careType),
          dueDate: Option.fromNullishOr(step.dueDate),
        })
      )
    ),
    Array.groupBy((s): string => s.careType),
    Record.values,
    Array.filterMap(
      Filter.fromPredicateOption((group) =>
        pipe(group, Array.sort(dueDateOrder), Array.head)
      )
    )
  )

export const acceptCarePlan = ({
  plan,
}: CarePlanContext): Effect.Effect<
  CarePlan,
  CarePlanNotProposedError | SqlError,
  CarePlanRepository | Care
> =>
  Effect.gen(function* () {
    const repo = yield* CarePlanRepository
    const care = yield* Care
    if (plan.status !== 'proposed') {
      return yield* new CarePlanNotProposedError({
        planId: plan.id,
        status: plan.status,
      })
    }

    yield* care.moveDueDays({
      reason: 'carePlan',
      moves: Array.map(
        scheduleTargetsFromSteps(plan.steps),
        ({ careType, dueDate }) => ({
          plantId: plan.plantId,
          careType,
          move: DueMove.To({ instant: DateTime.makeUnsafe(dueDate) }),
        })
      ),
    })

    const accepted = yield* repo.updateStatus(plan.id, plan.userId, {
      status: 'accepted',
      acceptedAt: nowAsDate(),
    })
    return pipe(
      Option.fromNullishOr(accepted),
      Option.getOrElse(() => plan)
    )
  }).pipe(
    Effect.withSpan('CarePlansService.acceptCarePlan', {
      attributes: { 'carePlan.id': plan.id },
    })
  )
