import { topic } from '@lily/api/kernel/outbox'
import { PlantOwner } from '@lily/shared'
import { Schema } from 'effect'

export const MemberLeftReason = Schema.Literals([
  'left',
  'removed',
  'accountDeleted',
])
export type MemberLeftReason = typeof MemberLeftReason.Type

/**
 * What Canopy tells other contexts. An event names what changed; a consumer
 * reads current state again and does not trust the values carried here.
 */
export const CanopyEvent = Schema.TaggedUnion({
  MemberJoined: { canopyId: Schema.String, userId: Schema.String },
  MemberLeft: {
    canopyId: Schema.String,
    userId: Schema.String,
    reason: MemberLeftReason,
  },
  /**
   * Every change of owner after insert, one event per receiver. `plantIds`
   * is never empty.
   */
  PlantsMoved: {
    plantIds: Schema.Array(Schema.String),
    from: PlantOwner,
    to: PlantOwner,
  },
  CanopyTimezoneChanged: { canopyId: Schema.String },
  PlantMuted: { plantId: Schema.String, userId: Schema.String },
  PlantUnmuted: { plantId: Schema.String, userId: Schema.String },
  /** Published after the `PlantsMoved` events of the same command. */
  CanopyDissolved: { canopyId: Schema.String },
})
export type CanopyEvent = typeof CanopyEvent.Type

export const CanopyTopic = topic('canopy', CanopyEvent)
