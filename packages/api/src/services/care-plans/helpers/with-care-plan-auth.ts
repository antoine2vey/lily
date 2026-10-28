import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import {
  asSteward,
  type CarePlanAction,
  carePlanAllows,
  carePlanRole,
} from '@lily/api/services/care-plans/helpers/care-plan-access'
import {
  asSeenBy,
  knowledgeView,
  type PlantRole,
} from '@lily/api/services/plants/helpers/plant-access'
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
import { Array, Effect, identity, Option } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export interface CarePlanContext {
  readonly plan: CarePlan
  readonly plant: PlantWithRoom
}

const authorLeftCanopy = (
  plan: CarePlan,
  plant: PlantWithRoom
): Effect.Effect<boolean, SqlError, CanopyRepository> =>
  Effect.flatMap(CanopyRepository, (canopies) =>
    Effect.map(
      canopies.findMembershipByUser(plan.userId),
      (membership) =>
        !Option.exists(
          Option.fromNullishOr(membership),
          (m) => m.canopyId === plant.canopyId
        )
    )
  )

const isSteward = (
  role: PlantRole,
  plan: CarePlan,
  plant: PlantWithRoom,
  viewerId: string
): Effect.Effect<boolean, SqlError, CanopyRepository> =>
  role._tag === 'CanopyOwner' && plan.userId !== viewerId
    ? authorLeftCanopy(plan, plant)
    : Effect.succeed(false)

export const withCarePlanAuth = (
  planId: string,
  action: CarePlanAction
): Effect.Effect<
  CarePlanContext,
  CarePlanNotFoundError | CarePlanNotAuthorizedError | SqlError,
  CarePlanRepository | PlantRepository | PlantAccessContext
> =>
  Effect.gen(function* () {
    const repo = yield* CarePlanRepository
    const plantRepo = yield* PlantRepository
    const { id: viewerId } = yield* CurrentUser
    const required = <A>(row: A | null) =>
      Option.match(Option.fromNullishOr(row), {
        onNone: () => Effect.fail(new CarePlanNotFoundError({ planId })),
        onSome: (value) => Effect.succeed(value),
      })

    const plan = yield* Effect.flatMap(repo.findById(planId), required)
    const plant = yield* Effect.flatMap(
      plantRepo.findById(plan.plantId),
      required
    )
    const plantRole = yield* resolvePlantRole(plant)
    const planRole = yield* Option.match(plantRole, {
      onNone: () => Effect.succeed(Option.none()),
      onSome: (role) =>
        Effect.map(isSteward(role, plan, plant, viewerId), (steward) =>
          Option.map(
            carePlanRole(knowledgeView(role, viewerId))(plan),
            steward ? asSteward : identity
          )
        ),
    })

    return yield* Option.match(planRole, {
      onNone: () => Effect.fail(new CarePlanNotFoundError({ planId })),
      onSome: (role) =>
        carePlanAllows(action)(role)
          ? Effect.succeed({ plan, plant })
          : Effect.fail(new CarePlanNotAuthorizedError({ planId })),
    })
  }).pipe(
    Effect.withSpan('withCarePlanAuth', {
      attributes: { 'carePlan.id': planId, action },
    })
  )

export interface CarePlanStepContext extends CarePlanContext {
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
    Effect.flatMap((context) =>
      Option.match(
        Array.findFirst(context.plan.steps, (s) => s.id === stepId),
        {
          onNone: () => new CarePlanStepNotFoundError({ stepId }),
          onSome: (step) => Effect.succeed({ ...context, step }),
        }
      )
    )
  )

export const seenByCaller = (
  plan: CarePlan
): Effect.Effect<CarePlan, never, CurrentUser> =>
  Effect.gen(function* () {
    const { id } = yield* CurrentUser
    return asSeenBy(id)(plan)
  })
