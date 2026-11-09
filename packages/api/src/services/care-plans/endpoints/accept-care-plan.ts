import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import type { PlantRepository } from '@lily/api/repositories/plant.repository'
import type { RecipientRepository } from '@lily/api/repositories/recipient.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import type { CarePlanContext } from '@lily/api/services/care-plans/helpers/with-care-plan-auth'
import { changeCare } from '@lily/api/services/plants/helpers/plant-change'
import { reconcileCareReminder } from '@lily/api/services/plants/helpers/reconcile-reminders'
import type { PlantAccessContext } from '@lily/api/services/plants/helpers/with-plant-access'
import { type CareType, nowAsDate } from '@lily/shared'
import type { CarePlan, CarePlanStep } from '@lily/shared/care-plan'
import { CarePlanNotProposedError } from '@lily/shared/errors/care-plan'
import { Array, Effect, Filter, Option, Order, pipe, Record } from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
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
  plant,
}: CarePlanContext): Effect.Effect<
  CarePlan,
  CarePlanNotProposedError | SqlError,
  | CarePlanRepository
  | CareScheduleRepository
  | PlantRepository
  | NotificationRepository
  | UserRepository
  | RecipientRepository
  | PlantAccessContext
  | SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const repo = yield* CarePlanRepository
    const scheduleRepo = yield* CareScheduleRepository
    if (plan.status !== 'proposed') {
      return yield* new CarePlanNotProposedError({
        planId: plan.id,
        status: plan.status,
      })
    }

    // Move each affected schedule's next date to the step's due date (either
    // direction). Plants without a schedule of that type are left alone: the
    // AI asked for a one-off action, not a recurring habit.
    const targets = scheduleTargetsFromSteps(plan.steps)
    const accepted = yield* changeCare(
      Array.map(targets, ({ careType }) => ({
        plantId: plan.plantId,
        careType,
      }))
    )(
      Effect.gen(function* () {
        yield* Effect.forEach(
          targets,
          ({ careType, dueDate }) =>
            Effect.gen(function* () {
              const schedule = yield* scheduleRepo.findByPlantAndType(
                plan.plantId,
                careType
              )
              if (!schedule) return
              yield* scheduleRepo.updateByPlantAndType(plan.plantId, careType, {
                nextCareAt: dueDate,
              })
              yield* reconcileCareReminder(
                plant.id,
                `${careType}_reminder` as const
              )
            }),
          { discard: true }
        )
        return yield* repo.updateStatus(plan.id, plan.userId, {
          status: 'accepted',
          acceptedAt: nowAsDate(),
        })
      })
    )
    return pipe(
      Option.fromNullishOr(accepted),
      Option.getOrElse(() => plan)
    )
  }).pipe(
    Effect.withSpan('CarePlansService.acceptCarePlan', {
      attributes: { 'carePlan.id': plan.id },
    })
  )
