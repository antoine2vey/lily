import type { SqlError } from '@effect/sql/SqlError'
import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import type { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { scheduleCareReminder } from '@lily/api/services/plants/helpers/schedule-care-reminder'
import { type CareType, nowAsDate } from '@lily/shared'
import type { CarePlan, CarePlanStep } from '@lily/shared/care-plan'
import { CarePlanNotProposedError } from '@lily/shared/errors/care-plan'
import { Array, Effect, Option, Order, pipe, Record } from 'effect'

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
    Array.filterMap((step) =>
      Option.all({
        careType: Option.fromNullable(step.careType),
        dueDate: Option.fromNullable(step.dueDate),
      })
    ),
    Array.groupBy((s) => s.careType),
    Record.values,
    Array.filterMap((group) =>
      pipe(group, Array.sort(dueDateOrder), Array.head)
    )
  )

/** `plan` comes from `withCarePlanAuth` in the handler. */
export const acceptCarePlan = (
  plan: CarePlan
): Effect.Effect<
  CarePlan,
  CarePlanNotProposedError | SqlError,
  | CarePlanRepository
  | CareScheduleRepository
  | PlantRepository
  | NotificationRepository
  | UserRepository
  | DelegationRepository
  | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* CarePlanRepository
    const scheduleRepo = yield* CareScheduleRepository
    const plantRepo = yield* PlantRepository

    if (plan.status !== 'proposed') {
      return yield* new CarePlanNotProposedError({
        planId: plan.id,
        status: plan.status,
      })
    }

    const plant = yield* plantRepo.findById(plan.plantId)
    const remindersEnabled = pipe(
      Option.fromNullable(plant),
      Option.map((p) => p.remindersEnabled),
      Option.getOrElse(() => false)
    )

    // Move each affected schedule's next date to the step's due date (either
    // direction). Plants without a schedule of that type are left alone: the
    // AI asked for a one-off action, not a recurring habit.
    yield* Effect.forEach(
      scheduleTargetsFromSteps(plan.steps),
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
          yield* scheduleCareReminder({
            plantId: plan.plantId,
            userId: plan.userId,
            type: `${careType}_reminder` as const,
            scheduledDate: dueDate,
            remindersEnabled,
          })
        }),
      { discard: true }
    )

    const accepted = yield* repo.updateStatus(plan.id, plan.userId, {
      status: 'accepted',
      acceptedAt: nowAsDate(),
    })
    return pipe(
      Option.fromNullable(accepted),
      Option.getOrElse(() => plan)
    )
  }).pipe(
    Effect.withSpan('CarePlansService.acceptCarePlan', {
      attributes: { 'carePlan.id': plan.id },
    })
  )
