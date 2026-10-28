import { Authentication } from '@lily/api/services/auth/middleware.types'
import {
  CarePlan,
  CarePlanListParams,
  CarePlanListResponse,
} from '@lily/shared/care-plan'
import {
  CarePlanNotAuthorizedError,
  CarePlanNotFoundError,
  CarePlanNotProposedError,
  CarePlanStepNotFoundError,
} from '@lily/shared/errors/care-plan'
import {
  PlantNotAuthorizedError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

const planIdParam = Schema.String.check(Schema.isGUID())
const stepIdParam = Schema.String.check(Schema.isGUID())
const plantIdParam = Schema.String.check(Schema.isGUID())

const Unauthorized = Schema.Struct({ error: Schema.String })

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
    HttpApiEndpoint.get('getPlantCarePlans', '/plant/:plantId', {
      params: { plantId: plantIdParam },
      success: CarePlanListResponse,
      error: [
        PlantNotFoundError,
        PlantNotAuthorizedError,
        Unauthorized.pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    HttpApiEndpoint.patch('acceptCarePlan', '/:planId/accept', {
      params: { planId: planIdParam },
      success: CarePlan,
      error: [
        CarePlanNotFoundError,
        CarePlanNotAuthorizedError,
        CarePlanNotProposedError,
        PlantNotFoundError,
        PlantNotAuthorizedError,
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
        CarePlanNotAuthorizedError,
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
        CarePlanNotAuthorizedError,
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
          CarePlanNotAuthorizedError,
          CarePlanStepNotFoundError,
          PlantNotFoundError,
          PlantNotAuthorizedError,
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
          CarePlanNotAuthorizedError,
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
        CarePlanNotAuthorizedError,
        CarePlanStepNotFoundError,
        Unauthorized.pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .prefix('/care-plans')
  .middleware(Authentication)
