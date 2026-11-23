import { Authentication } from '@lily/api/services/auth/middleware.types'
import { seen } from '@lily/api/services/plants/helpers/seen'
import { CarePlan, CarePlanListParams } from '@lily/shared/care-plan'
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

const SeenCarePlan = CarePlan.pipe(seen)
const SeenCarePlanList = Schema.Struct({ items: Schema.Array(SeenCarePlan) })
export type SeenCarePlanList = typeof SeenCarePlanList.Type

export const CarePlansApi = HttpApiGroup.make('carePlans')
  .add(
    HttpApiEndpoint.get('getCarePlans', '/', {
      query: CarePlanListParams,
      success: SeenCarePlanList,
      error: Unauthorized.pipe(HttpApiSchema.status(401)),
    })
  )
  .add(
    HttpApiEndpoint.get('getPlantCarePlans', '/plant/:plantId', {
      params: { plantId: plantIdParam },
      success: SeenCarePlanList,
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
      success: SeenCarePlan,
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
      success: SeenCarePlan,
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
        success: SeenCarePlan,
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
        success: SeenCarePlan,
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
      success: SeenCarePlan,
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
