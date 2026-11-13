import { topic } from '@lily/api/kernel/outbox'
import { Schema } from 'effect'

export const DelegationEndReason = Schema.Literals([
  'completed',
  'completedEarly',
  'canceled',
  'accountDeleted',
])
export type DelegationEndReason = typeof DelegationEndReason.Type

const Handover = {
  delegationId: Schema.String,
  ownerId: Schema.String,
  caretakerId: Schema.String,
  plantIds: Schema.Array(Schema.String),
}

/**
 * What Absence tells other contexts. A consumer reads current state again
 * and trusts only the ids carried here. `plantIds` is carried because a hard
 * account deletion cascades the delegation's plant links away before the
 * fact is heard.
 *
 * A delegation that ends before it started publishes nothing: it never
 * changed who is reminded. A vacation that is called off before it started
 * publishes nothing either.
 *
 * `VacationEnded` carries `start` and `endedAt` because the account holds no
 * vacation once it is published and nothing else remembers them.
 */
export const AbsenceEvent = Schema.TaggedUnion({
  DelegationStarted: Handover,
  DelegationEnded: { ...Handover, reason: DelegationEndReason },
  VacationStarted: { userId: Schema.String },
  VacationEnded: {
    userId: Schema.String,
    start: Schema.DateFromString,
    endedAt: Schema.DateFromString,
  },
})
export type AbsenceEvent = typeof AbsenceEvent.Type

export const AbsenceTopic = topic('absence', AbsenceEvent)
