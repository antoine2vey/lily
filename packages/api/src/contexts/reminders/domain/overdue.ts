import {
  barredBy,
  Change,
  hasOverdueCare,
  type PlantState,
  type Recipient,
  type Removal,
} from '@lily/api/contexts/reminders/domain/plan'
import type { CareDay, PlantOwner } from '@lily/shared'
import { Array, Data, type DateTime, Option, Order, pipe, Record } from 'effect'

export interface AudiencePlant {
  readonly id: string
  readonly owner: PlantOwner
  readonly dateAdded: Date
}

/** How many plants of an owner are reminded about. None is unlimited. */
export type CapOf = (owner: PlantOwner) => Option.Option<number>

const ownerKey = (owner: PlantOwner) =>
  owner._tag === 'User' ? `user:${owner.userId}` : `canopy:${owner.canopyId}`

export const capAudience = <P extends AudiencePlant>(
  plants: ReadonlyArray<P>,
  capOf: CapOf
): { readonly eligible: ReadonlyArray<P>; readonly overflow: number } => {
  const eligible = pipe(
    plants,
    Array.sort(Order.mapInput(Order.Date, (plant: P) => plant.dateAdded)),
    Array.groupBy((plant) => ownerKey(plant.owner)),
    Record.values,
    Array.flatMap((ofOwner) =>
      Option.match(capOf(ofOwner[0].owner), {
        onNone: () => ofOwner,
        onSome: (cap) => Array.take(ofOwner, cap),
      })
    )
  )
  return { eligible, overflow: plants.length - eligible.length }
}

export type OverdueSkip =
  | Removal
  | 'already-reminded'
  | 'nothing-overdue'
  | 'quiet-hours'

export type OverdueDecision = Data.TaggedEnum<{
  Planned: { readonly changes: Array.NonEmptyReadonlyArray<Change> }
  Skipped: { readonly why: OverdueSkip }
}>
export const OverdueDecision = Data.taggedEnum<OverdueDecision>()

export interface OverdueDigest {
  readonly recipient: Recipient
  readonly candidates: ReadonlyArray<PlantState>
  readonly day: CareDay
  readonly alreadyReminded: boolean
  readonly slot: Option.Option<DateTime.Utc>
  readonly now: DateTime.Utc
}

export const planOverdueDigest = ({
  recipient,
  candidates,
  day,
  alreadyReminded,
  slot,
  now,
}: OverdueDigest): OverdueDecision => {
  const recipients = new Map([[recipient.id, recipient]])
  const barOf = (plant: PlantState) =>
    barredBy(plant, recipient.id, recipients, now)
  const addressed = Array.filter(candidates, (plant) =>
    Option.isNone(barOf(plant))
  )
  if (Array.isReadonlyArrayEmpty(addressed)) {
    return OverdueDecision.Skipped({
      why: pipe(
        Array.getSomes(Array.map(candidates, barOf)),
        Array.head,
        Option.getOrElse((): OverdueSkip => 'nothing-overdue')
      ),
    })
  }
  if (alreadyReminded) {
    return OverdueDecision.Skipped({ why: 'already-reminded' })
  }
  const overdue = Array.filter(addressed, hasOverdueCare)
  if (!Array.isReadonlyArrayNonEmpty(overdue)) {
    return OverdueDecision.Skipped({ why: 'nothing-overdue' })
  }
  return Option.match(slot, {
    onNone: () => OverdueDecision.Skipped({ why: 'quiet-hours' }),
    onSome: (scheduledAt) =>
      OverdueDecision.Planned({
        changes: Array.map(overdue, (plant) =>
          Change.Put({
            userId: recipient.id,
            plantId: plant.id,
            type: 'overdue_reminder',
            occasion: day,
            scheduledAt,
          })
        ),
      }),
  })
}
