import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import {
  type CarePlanAction,
  carePlanAllows,
  carePlanRole,
} from '@lily/api/services/care-plans/helpers/care-plan-access'
import { knowledgeView } from '@lily/api/services/plants/helpers/plant-access'
import {
  type PlantAccessContext,
  resolvePlantRole,
} from '@lily/api/services/plants/helpers/with-plant-access'
import type { CarePlan, CarePlanStep } from '@lily/shared/care-plan'
import {
  CarePlanNotAuthorizedError,
  CarePlanNotFoundError,
  CarePlanStepNotFoundError,
} from '@lily/shared/errors/care-plan'
import { Array, Effect, Option } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const withCarePlanAuth = (
  planId: string,
  action: CarePlanAction
): Effect.Effect<
  CarePlan,
  CarePlanNotFoundError | CarePlanNotAuthorizedError | SqlError,
  CarePlanRepository | PlantRepository | PlantAccessContext
> =>
  Effect.gen(function* () {
    const repo = yield* CarePlanRepository
    const plantRepo = yield* PlantRepository
    const { id: viewerId } = yield* CurrentUser
    const notFound = new CarePlanNotFoundError({ planId })

    const plan = yield* repo.findById(planId)
    if (!plan) return yield* notFound
    const plant = yield* plantRepo.findById(plan.plantId)
    if (!plant) return yield* notFound
    const plantRole = yield* resolvePlantRole(plant)

    return yield* Option.match(
      Option.flatMap(plantRole, (role) =>
        carePlanRole(knowledgeView(role, viewerId))(plan)
      ),
      {
        onNone: () => notFound,
        onSome: (role) =>
          carePlanAllows(action)(role)
            ? Effect.succeed(plan)
            : new CarePlanNotAuthorizedError({ planId }),
      }
    )
  }).pipe(
    Effect.withSpan('withCarePlanAuth', {
      attributes: { 'carePlan.id': planId, action },
    })
  )

export interface CarePlanStepContext {
  readonly plan: CarePlan
  readonly step: CarePlanStep
}

/** `withCarePlanAuth` plus the step, which must belong to that plan. */
export const withCarePlanStep = (
  planId: string,
  stepId: string,
  action: CarePlanAction
): Effect.Effect<
  CarePlanStepContext,
  | CarePlanNotFoundError
  | CarePlanNotAuthorizedError
  | CarePlanStepNotFoundError
  | SqlError,
  CarePlanRepository | PlantRepository | PlantAccessContext
> =>
  withCarePlanAuth(planId, action).pipe(
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
