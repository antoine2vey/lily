import type { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import type { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import type { PlantRepository } from '@lily/api/repositories/plant.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import type { WeatherRepository } from '@lily/api/repositories/weather.repository'
import type { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { CarePlanStepContext } from '@lily/api/services/care-plans/helpers/with-care-plan-auth'
import { executePlantCare } from '@lily/api/services/plants/helpers/execute-plant-care'
import type { PlantAccessContext } from '@lily/api/services/plants/helpers/with-plant-access'
import type { WeatherCache } from '@lily/api/services/weather/cache'
import type { WeatherProvider } from '@lily/api/services/weather/provider'
import { nowAsDate } from '@lily/shared'
import type { CarePlan } from '@lily/shared/care-plan'
import type { EventBus } from '@lily/shared/server'
import { Effect, Option, pipe } from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

/**
 * Completes one step. Care-typed steps go through the regular care flow
 * (care log, schedule advance, reminders); if the plant was already cared for
 * today the step is simply ticked without a second log. Free-text steps are
 * ticked directly. The plan flips to `completed` once every step is done.
 */
export const completeCarePlanStep = ({
  plan,
  plant,
  step,
}: CarePlanStepContext): Effect.Effect<
  CarePlan,
  SqlError,
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
  | PlantAccessContext
  | EventBus
  | CurrentUser
  | SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const repo = yield* CarePlanRepository

    if (Option.isSome(Option.fromNullishOr(step.completedAt))) {
      return plan
    }

    const tickDirectly = repo.completeStep(step.id, {
      completedAt: nowAsDate(),
    })

    yield* pipe(
      Option.fromNullishOr(step.careType),
      Option.match({
        onNone: () => tickDirectly,
        onSome: (careType) =>
          executePlantCare(plant, {
            plantId: plan.plantId,
            careType,
            carePlanStepId: step.id,
          }).pipe(
            Effect.catchTag('AlreadyCaredTodayError', () => tickDirectly),
            // Unreachable: no `date` is passed, so the care time is "now".
            Effect.catchTag('FutureDateNotAllowedError', (e) => Effect.die(e))
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
