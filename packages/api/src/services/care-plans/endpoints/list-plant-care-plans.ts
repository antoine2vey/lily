import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import type { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { SeenCarePlanList } from '@lily/api/services/care-plans/api'
import { seesCarePlan } from '@lily/api/services/care-plans/helpers/care-plan-access'
import type { KnowledgeView } from '@lily/api/services/plants/helpers/plant-access'
import { seenByCaller } from '@lily/api/services/plants/helpers/seen'
import { Array, Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const listPlantCarePlans = (
  plantId: string,
  view: KnowledgeView
): Effect.Effect<
  SeenCarePlanList,
  SqlError,
  CarePlanRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* CarePlanRepository
    const plans = yield* repo.findByPlant(plantId)
    return {
      items: yield* Effect.forEach(
        Array.filter(plans, seesCarePlan(view)),
        seenByCaller
      ),
    }
  }).pipe(
    Effect.withSpan('CarePlansService.listPlantCarePlans', {
      attributes: { 'plant.id': plantId },
    })
  )
