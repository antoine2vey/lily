import { topic } from '@lily/api/kernel/outbox'
import { CareDay, CareType, PlantOwner } from '@lily/shared'
import { Schema } from 'effect'

export const ScheduleChangeReason = Schema.Literals([
  'care',
  'frequency',
  'created',
  'dropped',
  'carePlan',
  'vacation',
  'weather',
  'revived',
])
export type ScheduleChangeReason = typeof ScheduleChangeReason.Type

export const LifeChange = Schema.Literals([
  'Planted',
  'Buried',
  'Revived',
  'Removed',
])
export type LifeChange = typeof LifeChange.Type

/**
 * What Care tells other contexts. An event names what changed; a consumer
 * reads current state again and does not trust the values carried here.
 */
export const CareEvent = Schema.TaggedUnion({
  CareRecorded: {
    plantId: Schema.String,
    owner: PlantOwner,
    careLogId: Schema.String,
    careType: CareType,
    day: CareDay,
    by: Schema.NullOr(Schema.String),
    /** The plant had an overdue care when this one was recorded. */
    answeredAttention: Schema.Boolean,
  },
  CareAmended: {
    plantId: Schema.String,
    careLogId: Schema.String,
    careType: CareType,
  },
  CareRemoved: {
    plantId: Schema.String,
    careLogId: Schema.String,
    careType: CareType,
  },
  ScheduleChanged: {
    plantId: Schema.String,
    careType: CareType,
    dueDay: Schema.NullOr(CareDay),
    reason: ScheduleChangeReason,
  },
  PlantLifeChanged: {
    plantId: Schema.String,
    owner: PlantOwner,
    life: LifeChange,
    by: Schema.NullOr(Schema.String),
  },
})
export type CareEvent = typeof CareEvent.Type

export const CareTopic = topic('care', CareEvent)
