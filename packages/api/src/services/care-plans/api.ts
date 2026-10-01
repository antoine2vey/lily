import { Authentication } from '@lily/api/services/auth/middleware.types'
import {
  CarePlan,
  CarePlanListParams,
  CarePlanListResponse,
} from '@lily/shared/care-plan'
import {
  CarePlanNotFoundError,
  CarePlanNotProposedError,
  CarePlanStepNotFoundError,
} from '@lily/shared/errors/care-plan'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

const planIdParam = Schema.String.check(Schema.isGUID())
const stepIdParam = Schema.String.check(Schema.isGUID())
const plantIdParam = Schema.String.check(Schema.isGUID())

const Unauthorized = Schema.Struct({ error: Schema.String })

// All routes are owner-scoped: the repository filters by the current user, so
// a caretaker of a delegated plant never sees its plans (v1 decision).
export const CarePlansApi = HttpApiGroup.make('carePlans')
  .add(
    // GET /care-plans?status=accepted — plans for the Care tab
    HttpApiEndpoint.get('getCarePlans', '/', {
      query: CarePlanListParams,
      success: CarePlanListResponse,
      error: Unauthorized.pipe(HttpApiSchema.status(401)),
    })
  )
  .add(
    // GET /care-plans/plant/:plantId — every plan for one plant (any status)
    HttpApiEndpoint.get('getPlantCarePlans', '/plant/:plantId', {
      params: { plantId: plantIdParam },
      success: CarePlanListResponse,
      error: Unauthorized.pipe(HttpApiSchema.status(401)),
    })
  )
  .add(
    HttpApiEndpoint.patch('acceptCarePlan', '/:planId/accept', {
      params: { planId: planIdParam },
      success: CarePlan,
      error: [
        CarePlanNotFoundError,
        CarePlanNotProposedError,
        Unauthorized.pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    HttpApiEndpoint.patch('dismissCarePlan', '/:planId/dismiss', {
      params: { planId: planIdParam },
      success: CarePlan,
      error: [
        CarePlanNotFoundError,
        CarePlanNotProposedError,
        Unauthorized.pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    HttpApiEndpoint.delete('deleteCarePlan', '/:planId', {
      params: { planId: planIdParam },
      success: Schema.Struct({ message: Schema.String }),
      error: [
        CarePlanNotFoundError,
        Unauthorized.pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    HttpApiEndpoint.patch(
      'completeCarePlanStep',
      '/:planId/steps/:stepId/complete',
      {
        params: { planId: planIdParam, stepId: stepIdParam },
        success: CarePlan,
        error: [
          CarePlanNotFoundError,
          CarePlanStepNotFoundError,
          PlantNotFoundError,
          Unauthorized.pipe(HttpApiSchema.status(401)),
        ],
      }
    )
  )
  .add(
    HttpApiEndpoint.patch(
      'uncompleteCarePlanStep',
      '/:planId/steps/:stepId/uncomplete',
      {
        params: { planId: planIdParam, stepId: stepIdParam },
        success: CarePlan,
        error: [
          CarePlanNotFoundError,
          CarePlanStepNotFoundError,
          Unauthorized.pipe(HttpApiSchema.status(401)),
        ],
      }
    )
  )
  .add(
    HttpApiEndpoint.delete('deleteCarePlanStep', '/:planId/steps/:stepId', {
      params: { planId: planIdParam, stepId: stepIdParam },
      success: CarePlan,
      error: [
        CarePlanNotFoundError,
        CarePlanStepNotFoundError,
        Unauthorized.pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .prefix('/care-plans')
  .middleware(Authentication)
