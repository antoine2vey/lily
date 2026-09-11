import type { SqlError } from '@effect/sql/SqlError'
import type { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import type { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import type { WeatherRepository } from '@lily/api/repositories/weather.repository'
import type { CurrentUser } from '@lily/api/services/auth/middleware.types'
import {
  requireOwnedPlan,
  requireStep,
} from '@lily/api/services/care-plans/helpers/require-owned-plan'
import { executePlantCare } from '@lily/api/services/plants/helpers/execute-plant-care'
import type { WeatherCache } from '@lily/api/services/weather/cache'
import type { WeatherProvider } from '@lily/api/services/weather/provider'
import { nowAsDate } from '@lily/shared'
import type { CarePlan } from '@lily/shared/care-plan'
import type {
  CarePlanNotFoundError,
  CarePlanStepNotFoundError,
} from '@lily/shared/errors/care-plan'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import type { EventBus } from '@lily/shared/server'
import { Effect, Option, pipe } from 'effect'

/**
 * Completes one step. Care-typed steps go through the regular care flow
 * (care log, schedule advance, reminders); if the plant was already cared for
 * today the step is simply ticked without a second log. Free-text steps are
 * ticked directly. The plan flips to `completed` once every step is done.
 */
export const completeCarePlanStep = (
  planId: string,
  stepId: string
): Effect.Effect<
  CarePlan,
  | CarePlanNotFoundError
  | CarePlanStepNotFoundError
  | PlantNotFoundError
  | SqlError,
  | CarePlanRepository
  | PlantRepository
  | CareLogRepository
  | CareScheduleRepository
  | NotificationRepository
  | UserRepository
  | WeatherProvider
  | WeatherCache
  | WeatherRepository
  | DelegationRepository
  | EventBus
  | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* CarePlanRepository
    const plantRepo = yield* PlantRepository

    const plan = yield* requireOwnedPlan(planId)
    const step = yield* requireStep(plan, stepId)

    if (Option.isSome(Option.fromNullable(step.completedAt))) {
      return plan
    }

    const tickDirectly = repo.completeStep(stepId, { completedAt: nowAsDate() })

    yield* pipe(
      Option.fromNullable(step.careType),
      Option.match({
        onNone: () => tickDirectly,
        onSome: (careType) =>
          Effect.gen(function* () {
            const plant = yield* plantRepo.findById(plan.plantId)
            if (!plant) {
              return yield* new PlantNotFoundError({ plantId: plan.plantId })
            }
            return yield* executePlantCare(plant, {
              plantId: plan.plantId,
              careType,
              carePlanStepId: stepId,
            }).pipe(
              Effect.catchTag('AlreadyCaredTodayError', () => tickDirectly),
              // Unreachable: no `date` is passed, so the care time is "now".
              Effect.catchTag('FutureDateNotAllowedError', (e) => Effect.die(e))
            )
          }),
      })
    )

    const settled = yield* repo.settleCompletion(planId)
    return pipe(
      Option.fromNullable(settled),
      Option.getOrElse(() => plan)
    )
  }).pipe(
    Effect.withSpan('CarePlansService.completeCarePlanStep', {
      attributes: { 'carePlan.id': planId, 'carePlanStep.id': stepId },
    })
  )
