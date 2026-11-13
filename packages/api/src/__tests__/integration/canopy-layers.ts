import {
  drainedOn,
  ManualOutboxLive,
} from '@lily/api/__tests__/integration/care-layers'
import { Canopy, CanopyLive } from '@lily/api/contexts/canopy'
import { CareLive } from '@lily/api/contexts/care'
import { Effect, Layer } from 'effect'

export const CanopyOnPostgresLive = CanopyLive.pipe(
  Layer.provideMerge(ManualOutboxLive)
)

export const settled = drainedOn(CanopyOnPostgresLive)

export const delivered = drainedOn(
  Layer.mergeAll(CareLive, CanopyLive).pipe(
    Layer.provideMerge(ManualOutboxLive)
  )
)

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
