import type { SqlError } from '@effect/sql/SqlError'
import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { CarePlanListResponse } from '@lily/shared/care-plan'
import { Effect } from 'effect'

export const listPlantCarePlans = (
  plantId: string
): Effect.Effect<
  CarePlanListResponse,
  SqlError,
  CarePlanRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* CarePlanRepository
    const { id: userId } = yield* CurrentUser
    const items = yield* repo.findByPlant(plantId, userId)
    return { items }
  }).pipe(
    Effect.withSpan('CarePlansService.listPlantCarePlans', {
      attributes: { 'plant.id': plantId },
    })
  )
