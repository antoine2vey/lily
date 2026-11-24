import { Canopy } from '@lily/api/contexts/canopy'
import type { PlantPermit } from '@lily/api/kernel/permit'
import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import type { PlantWithRoom } from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

const setMute = (permit: PlantPermit<'mute'>, muted: boolean) =>
  Effect.flatMap(Canopy, (canopy) => canopy.setMute({ permit, muted }))

export const mutePlant = Effect.fn('PlantsService.mutePlant')(
  (permit: PlantPermit<'mute'>) => setMute(permit, true)
)

export const unmutePlant = Effect.fn('PlantsService.unmutePlant')(
  (permit: PlantPermit<'mute'>) => setMute(permit, false)
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
