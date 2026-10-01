import type { Api } from '@lily/api/api'
import { acceptCarePlan } from '@lily/api/services/care-plans/endpoints/accept-care-plan'
import { completeCarePlanStep } from '@lily/api/services/care-plans/endpoints/complete-care-plan-step'
import { deleteCarePlan } from '@lily/api/services/care-plans/endpoints/delete-care-plan'
import { deleteCarePlanStep } from '@lily/api/services/care-plans/endpoints/delete-care-plan-step'
import { dismissCarePlan } from '@lily/api/services/care-plans/endpoints/dismiss-care-plan'
import { listCarePlans } from '@lily/api/services/care-plans/endpoints/list-care-plans'
import { listPlantCarePlans } from '@lily/api/services/care-plans/endpoints/list-plant-care-plans'
import { uncompleteCarePlanStep } from '@lily/api/services/care-plans/endpoints/uncomplete-care-plan-step'
import {
  withCarePlanAuth,
  withCarePlanStep,
} from '@lily/api/services/care-plans/helpers/with-care-plan-auth'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'

// Ownership is resolved once per request by `withCarePlanAuth` /
// `withCarePlanStep` (same shape as `withPlantAuth`); endpoints receive the
// loaded entities and never re-fetch them.
export const CarePlansApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'carePlans', (handlers) =>
    handlers
      .handle('getCarePlans', ({ query: urlParams }) =>
        listCarePlans(urlParams.status).pipe(withInfraErrorsAsDefect)
      )
      .handle('getPlantCarePlans', ({ params: { plantId } }) =>
        listPlantCarePlans(plantId).pipe(withInfraErrorsAsDefect)
      )
      .handle('acceptCarePlan', ({ params: { planId } }) =>
        withCarePlanAuth(planId).pipe(
          Effect.flatMap(acceptCarePlan),
          withInfraErrorsAsDefect
        )
      )
      .handle('dismissCarePlan', ({ params: { planId } }) =>
        withCarePlanAuth(planId).pipe(
          Effect.flatMap(dismissCarePlan),
          withInfraErrorsAsDefect
        )
      )
      .handle('deleteCarePlan', ({ params: { planId } }) =>
        withCarePlanAuth(planId).pipe(
          Effect.flatMap(deleteCarePlan),
          withInfraErrorsAsDefect
        )
      )
      .handle('completeCarePlanStep', ({ params: { planId, stepId } }) =>
        withCarePlanStep(planId, stepId).pipe(
          Effect.flatMap(completeCarePlanStep),
          withInfraErrorsAsDefect
        )
      )
      .handle('uncompleteCarePlanStep', ({ params: { planId, stepId } }) =>
        withCarePlanStep(planId, stepId).pipe(
          Effect.flatMap(uncompleteCarePlanStep),
          withInfraErrorsAsDefect
        )
      )
      .handle('deleteCarePlanStep', ({ params: { planId, stepId } }) =>
        withCarePlanStep(planId, stepId).pipe(
          Effect.flatMap(deleteCarePlanStep),
          withInfraErrorsAsDefect
        )
      )
  )
