import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import type { PlantWithRoom } from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { Effect } from 'effect'

export const mutePlant = Effect.fn('PlantsService.mutePlant')(function* (
  plant: PlantWithRoom
) {
  const { id: userId } = yield* CurrentUser
  const repo = yield* CanopyRepository
  yield* repo.mute(userId, plant.id)
})

export const unmutePlant = Effect.fn('PlantsService.unmutePlant')(function* (
  plant: PlantWithRoom
) {
  const { id: userId } = yield* CurrentUser
  const repo = yield* CanopyRepository
  yield* repo.unmute(userId, plant.id)
})
