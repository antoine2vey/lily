import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import { seesCarePlan } from '@lily/api/services/care-plans/helpers/care-plan-access'
import type { KnowledgeView } from '@lily/api/services/plants/helpers/plant-access'
import type { CarePlanListResponse } from '@lily/shared/care-plan'
import { Array, Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const listPlantCarePlans = (
  plantId: string,
  view: KnowledgeView
): Effect.Effect<CarePlanListResponse, SqlError, CarePlanRepository> =>
  Effect.gen(function* () {
    const repo = yield* CarePlanRepository
    const plans = yield* repo.findByPlant(plantId)
    return { items: Array.filter(plans, seesCarePlan(view)) }
  }).pipe(
    Effect.withSpan('CarePlansService.listPlantCarePlans', {
      attributes: { 'plant.id': plantId },
    })
  )
