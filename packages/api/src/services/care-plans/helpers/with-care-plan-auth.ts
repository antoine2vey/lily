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
  CarePlanNotFoundError,
  CarePlanStepNotFoundError,
} from '@lily/shared/errors/care-plan'
import { Array, Effect, Option } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

/**
 * Loads a plan the caller may act on, or fails with a 404-style error, also
 * when the caller can see the plan but the action is the author's alone.
 * Composed in the handler (like `withPlantAuth`): endpoints receive the plan
 * and must not re-fetch it.
 */
export const withCarePlanAuth = (
  planId: string,
  action: CarePlanAction
): Effect.Effect<
  CarePlan,
  CarePlanNotFoundError | SqlError,
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

    const allowed = Option.exists(
      Option.flatMap(plantRole, (role) =>
        carePlanRole(knowledgeView(role, viewerId))(plan)
      ),
      carePlanAllows(action)
    )
    return allowed ? plan : yield* notFound
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
  CarePlanNotFoundError | CarePlanStepNotFoundError | SqlError,
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
