import { Canopy } from '@lily/api/contexts/canopy'
import type { PlantPermit } from '@lily/api/kernel/permit'
import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import type { PlantWithRoom } from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

const setMute = (
  permit: PlantPermit<'mute'>,
  muted: boolean,
  requestedId: string
) =>
  Effect.flatMap(Canopy, (canopy) => canopy.setMute({ permit, muted })).pipe(
    Effect.mapError(() => new PlantNotFoundError({ plantId: requestedId }))
  )

export const mutePlant = Effect.fn('PlantsService.mutePlant')(
  (permit: PlantPermit<'mute'>, requestedId: string = permit.plantId) =>
    setMute(permit, true, requestedId)
)

export const unmutePlant = Effect.fn('PlantsService.unmutePlant')(
  (permit: PlantPermit<'mute'>, requestedId: string = permit.plantId) =>
    setMute(permit, false, requestedId)
)

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
