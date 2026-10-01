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

const planIdParam = HttpApiSchema.param(
  'planId',
  Schema.String.check(Schema.isGUID())
)
const stepIdParam = HttpApiSchema.param(
  'stepId',
  Schema.String.check(Schema.isGUID())
)
const plantIdParam = HttpApiSchema.param(
  'plantId',
  Schema.String.check(Schema.isGUID())
)

const Unauthorized = Schema.Struct({ error: Schema.String })

// All routes are owner-scoped: the repository filters by the current user, so
// a caretaker of a delegated plant never sees its plans (v1 decision).
export const CarePlansApi = HttpApiGroup.make('carePlans')
  .add(
    // GET /care-plans?status=accepted — plans for the Care tab
    HttpApiEndpoint.get('getCarePlans')`/`
      .setUrlParams(CarePlanListParams)
      .addSuccess(CarePlanListResponse)
      .addError(Unauthorized, { status: 401 })
  )
  .add(
    // GET /care-plans/plant/:plantId — every plan for one plant (any status)
    HttpApiEndpoint.get('getPlantCarePlans')`/plant/${plantIdParam}`
      .addSuccess(CarePlanListResponse)
      .addError(Unauthorized, { status: 401 })
  )
  .add(
    HttpApiEndpoint.patch('acceptCarePlan')`/${planIdParam}/accept`
      .addSuccess(CarePlan)
      .addError(CarePlanNotFoundError, { status: 404 })
      .addError(CarePlanNotProposedError, { status: 409 })
      .addError(Unauthorized, { status: 401 })
  )
  .add(
    HttpApiEndpoint.patch('dismissCarePlan')`/${planIdParam}/dismiss`
      .addSuccess(CarePlan)
      .addError(CarePlanNotFoundError, { status: 404 })
      .addError(CarePlanNotProposedError, { status: 409 })
      .addError(Unauthorized, { status: 401 })
  )
  .add(
    HttpApiEndpoint.delete('deleteCarePlan')`/${planIdParam}`
      .addSuccess(Schema.Struct({ message: Schema.String }))
      .addError(CarePlanNotFoundError, { status: 404 })
      .addError(Unauthorized, { status: 401 })
  )
  .add(
    HttpApiEndpoint.patch(
      'completeCarePlanStep'
    )`/${planIdParam}/steps/${stepIdParam}/complete`
      .addSuccess(CarePlan)
      .addError(CarePlanNotFoundError, { status: 404 })
      .addError(CarePlanStepNotFoundError, { status: 404 })
      .addError(PlantNotFoundError, { status: 404 })
      .addError(Unauthorized, { status: 401 })
  )
  .add(
    HttpApiEndpoint.patch(
      'uncompleteCarePlanStep'
    )`/${planIdParam}/steps/${stepIdParam}/uncomplete`
      .addSuccess(CarePlan)
      .addError(CarePlanNotFoundError, { status: 404 })
      .addError(CarePlanStepNotFoundError, { status: 404 })
      .addError(Unauthorized, { status: 401 })
  )
  .add(
    HttpApiEndpoint.delete(
      'deleteCarePlanStep'
    )`/${planIdParam}/steps/${stepIdParam}`
      .addSuccess(CarePlan)
      .addError(CarePlanNotFoundError, { status: 404 })
      .addError(CarePlanStepNotFoundError, { status: 404 })
      .addError(Unauthorized, { status: 401 })
  )
  .prefix('/care-plans')
  .middleware(Authentication)
