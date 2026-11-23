import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import type { SeenCarePlanList } from '@lily/api/services/care-plans/api'
import { seesCarePlan } from '@lily/api/services/care-plans/helpers/care-plan-access'
import type { KnowledgeView } from '@lily/api/services/plants/helpers/plant-access'
import { asSeenBy } from '@lily/api/services/plants/helpers/seen'
import { Array, Effect, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const listPlantCarePlans = (
  plantId: string,
  view: KnowledgeView
): Effect.Effect<SeenCarePlanList, SqlError, CarePlanRepository> =>
  Effect.gen(function* () {
    const repo = yield* CarePlanRepository
    const plans = yield* repo.findByPlant(plantId)
    return {
      items: pipe(
        plans,
        Array.filter(seesCarePlan(view)),
        Array.map(asSeenBy(view.viewerId))
      ),
    }
  }).pipe(
    Effect.withSpan('CarePlansService.listPlantCarePlans', {
      attributes: { 'plant.id': plantId },
    })
  )
