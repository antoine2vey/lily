import { Dirty, Reminders } from '@lily/api/contexts/reminders'
import { transact } from '@lily/api/kernel/transact'
import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import type { PlantWithRoom } from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { withOwnerLock } from '@lily/api/services/plants/helpers/owner-lock'
import { reloadOwnedPlant } from '@lily/api/services/plants/helpers/reload-owned-plant'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const mutePlant = Effect.fn('PlantsService.mutePlant')(function* (
  plant: PlantWithRoom,
  requestedId: string = plant.id
) {
  const { id: userId } = yield* CurrentUser
  const repo = yield* CanopyRepository
  yield* withOwnerLock(plant.owner)(
    Effect.gen(function* () {
      yield* reloadOwnedPlant(plant, requestedId)
      yield* repo.mute(userId, plant.id)
      yield* Reminders.request(Dirty.Plants({ plantIds: [plant.id] }))
    })
  ).pipe(
    Effect.catchTag('CanopyNotFoundError', () =>
      Effect.fail(new PlantNotFoundError({ plantId: requestedId }))
    )
  )
})

export const unmutePlant = Effect.fn('PlantsService.unmutePlant')(function* (
  plant: PlantWithRoom
) {
  const { id: userId } = yield* CurrentUser
  const repo = yield* CanopyRepository
  yield* transact(
    Effect.andThen(
      repo.unmute(userId, plant.id),
      Reminders.request(Dirty.Plants({ plantIds: [plant.id] }))
    )
  )
})

// Muting is per member, so only the caller's own state is reported, and only
// on Canopy plants.
export const withMuteState = <P extends PlantWithRoom>(
  plant: P
): Effect.Effect<
  P & { readonly muted?: boolean },
  SqlError,
  CurrentUser | CanopyRepository
> =>
  Effect.gen(function* () {
    if (plant.ownership !== 'canopy') return plant
    const { id: userId } = yield* CurrentUser
    const repo = yield* CanopyRepository
    return { ...plant, muted: yield* repo.isMuted(userId, plant.id) }
  }).pipe(Effect.withSpan('PlantsService.withMuteState'))
