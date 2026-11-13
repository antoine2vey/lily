import {
  drainedOn,
  ManualOutboxLive,
} from '@lily/api/__tests__/integration/care-layers'
import { AbsenceLive } from '@lily/api/contexts/absence'
import { Canopy } from '@lily/api/contexts/canopy'
import { CanopyLive as CanopyOverAStore } from '@lily/api/contexts/canopy/canopy'
import { CanopyStoreLive } from '@lily/api/contexts/canopy/store'
import { CareLive } from '@lily/api/contexts/care'
import { Effect, Layer } from 'effect'

export const CanopyOnPostgresLive = CanopyOverAStore.pipe(
  Layer.provideMerge(CanopyStoreLive),
  Layer.provideMerge(AbsenceLive),
  Layer.provideMerge(CareLive),
  Layer.provideMerge(ManualOutboxLive)
)

export const settled = drainedOn(CanopyOnPostgresLive)

export const delivered = settled

export const leave = (by: string) =>
  Effect.flatMap(Canopy, (canopy) => canopy.leave({ by }))

export const dissolve = (by: string) =>
  Effect.flatMap(Canopy, (canopy) => canopy.dissolve({ by }))

export const leaveForDeletion =
  (userId: string) =>
  <A, E, R>(deletion: Effect.Effect<A, E, R>) =>
    Effect.flatMap(Canopy, (canopy) =>
      canopy.leaveForDeletion(userId)(deletion)
    )
