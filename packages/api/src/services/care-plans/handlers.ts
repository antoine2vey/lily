import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { acceptCarePlan } from '@lily/api/services/care-plans/endpoints/accept-care-plan'
import { completeCarePlanStep } from '@lily/api/services/care-plans/endpoints/complete-care-plan-step'
import { deleteCarePlan } from '@lily/api/services/care-plans/endpoints/delete-care-plan'
import { deleteCarePlanStep } from '@lily/api/services/care-plans/endpoints/delete-care-plan-step'
import { dismissCarePlan } from '@lily/api/services/care-plans/endpoints/dismiss-care-plan'
import { listCarePlans } from '@lily/api/services/care-plans/endpoints/list-care-plans'
import { listPlantCarePlans } from '@lily/api/services/care-plans/endpoints/list-plant-care-plans'
import { uncompleteCarePlanStep } from '@lily/api/services/care-plans/endpoints/uncomplete-care-plan-step'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'

export const CarePlansApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'carePlans', (handlers) =>
    handlers
      .handle('getCarePlans', ({ urlParams }) =>
        listCarePlans(urlParams.status).pipe(withInfraErrorsAsDefect)
      )
      .handle('getPlantCarePlans', ({ path: { plantId } }) =>
        listPlantCarePlans(plantId).pipe(withInfraErrorsAsDefect)
      )
      .handle('acceptCarePlan', ({ path: { planId } }) =>
        acceptCarePlan(planId).pipe(withInfraErrorsAsDefect)
      )
      .handle('dismissCarePlan', ({ path: { planId } }) =>
        dismissCarePlan(planId).pipe(withInfraErrorsAsDefect)
      )
      .handle('deleteCarePlan', ({ path: { planId } }) =>
        deleteCarePlan(planId).pipe(withInfraErrorsAsDefect)
      )
      .handle('completeCarePlanStep', ({ path: { planId, stepId } }) =>
        completeCarePlanStep(planId, stepId).pipe(withInfraErrorsAsDefect)
      )
      .handle('uncompleteCarePlanStep', ({ path: { planId, stepId } }) =>
        uncompleteCarePlanStep(planId, stepId).pipe(withInfraErrorsAsDefect)
      )
      .handle('deleteCarePlanStep', ({ path: { planId, stepId } }) =>
        deleteCarePlanStep(planId, stepId).pipe(withInfraErrorsAsDefect)
      )
  )
