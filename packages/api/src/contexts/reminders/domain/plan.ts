import {
  type CareDay,
  type CareStatus,
  type CareType,
  isOnVacation,
  type VacationFields,
} from '@lily/shared'
import { Array, Data, DateTime, Option, pipe } from 'effect'

export type CareReminderType = `${CareType}_reminder`
export type ReminderType = CareReminderType | 'overdue_reminder'

export const reminderTypeOf = (careType: CareType): CareReminderType =>
  `${careType}_reminder`

export type Delivery = Data.TaggedEnum<{
  Pending: { readonly retrying: boolean }
  Queued: Record<never, never>
  InFlight: Record<never, never>
  Sent: Record<never, never>
  Failed: Record<never, never>
}>
export const Delivery = Data.taggedEnum<Delivery>()

interface RowBase {
  readonly id: string
  readonly userId: string
  readonly delivery: Delivery
  readonly scheduledAt: DateTime.Utc
}

export interface CareReminderRow extends RowBase {
  readonly type: CareReminderType
  readonly dueDay: Option.Option<CareDay>
}

export interface OverdueReminderRow extends RowBase {
  readonly type: 'overdue_reminder'
}

export type ReminderRow = CareReminderRow | OverdueReminderRow

export interface CareLine {
  readonly careType: CareType
  readonly dueDay: CareDay
  readonly status: CareStatus
}

export interface Recipient {
  readonly id: string
  readonly active: boolean
  readonly careReminders: boolean
  readonly vacation: VacationFields
  readonly sendTimes: ReadonlyMap<CareDay, DateTime.Utc>
}

export type Life = Data.TaggedEnum<{
  Living: { readonly lines: ReadonlyArray<CareLine> }
  Dead: Record<never, never>
}>
export const Life = Data.taggedEnum<Life>()

export interface PlantState {
  readonly id: string
  readonly life: Life
  readonly remindersEnabled: boolean
  readonly shared: boolean
  readonly audience: ReadonlyArray<string>
  readonly rows: ReadonlyArray<ReminderRow>
}

export const linesOf = (plant: PlantState): ReadonlyArray<CareLine> =>
  plant.life._tag === 'Living' ? plant.life.lines : []

export type Removal =
  | 'plant-dead'
  | 'reminders-disabled'
  | 'not-in-audience'
  | 'unreachable'
  | 'care-reminders-off'
  | 'on-vacation'
  | 'no-schedule'
  | 'superseded'
  | 'already-announced'
  | 'no-longer-overdue'

export type Change = Data.TaggedEnum<{
  Put: {
    readonly userId: string
    readonly plantId: string
    readonly type: ReminderType
    readonly occasion: CareDay
    readonly scheduledAt: DateTime.Utc
  }
  Retime: {
    readonly rowId: string
    readonly userId: string
    readonly occasion: CareDay
    readonly scheduledAt: DateTime.Utc
  }
  Remove: {
    readonly rowId: string
    readonly userId: string
    readonly why: Removal
  }
}>
export const Change = Data.taggedEnum<Change>()

export const barredBy = (
  plant: PlantState,
  userId: string,
  recipients: ReadonlyMap<string, Recipient>,
  now: DateTime.Utc
): Option.Option<Removal> => {
  if (plant.life._tag === 'Dead') return Option.some('plant-dead')
  if (!plant.remindersEnabled) return Option.some('reminders-disabled')
  if (!Array.contains(plant.audience, userId)) {
    return Option.some('not-in-audience')
  }
  return pipe(
    Option.fromNullishOr(recipients.get(userId)),
    Option.match({
      onNone: (): Option.Option<Removal> => Option.some('unreachable'),
      onSome: (recipient) => {
        if (!recipient.active) return Option.some('unreachable')
        if (!recipient.careReminders) return Option.some('care-reminders-off')
        return isOnVacation(recipient.vacation, DateTime.toDateUtc(now))
          ? Option.some('on-vacation')
          : Option.none()
      },
    })
  )
}

export const hasOverdueCare = (plant: PlantState) =>
  Array.some(linesOf(plant), (line) => line.status._tag === 'Overdue')

const isPending = (row: ReminderRow) => row.delivery._tag === 'Pending'

const isWaiting = (row: ReminderRow) =>
  isPending(row) || row.delivery._tag === 'Queued'

const isAbout = (day: CareDay) => (row: CareReminderRow) =>
  Option.contains(row.dueDay, day)

const remove = (rows: ReadonlyArray<ReminderRow>, why: Removal) =>
  Array.map(rows, (row) =>
    Change.Remove({ rowId: row.id, userId: row.userId, why })
  )

const settledByDelivery = (row: ReminderRow, now: DateTime.Utc) =>
  (row.delivery._tag === 'Pending' && row.delivery.retrying) ||
  DateTime.isLessThanOrEqualTo(row.scheduledAt, now)

type Standing = Data.TaggedEnum<{
  Announced: Record<never, never>
  Ahead: { readonly sendAt: DateTime.Utc }
  HandedOver: { readonly sendAt: DateTime.Utc }
  Late: Record<never, never>
}>
const Standing = Data.taggedEnum<Standing>()

const standingOf = (
  line: CareLine,
  recipient: Recipient,
  slotRows: ReadonlyArray<CareReminderRow>,
  handedOver: ReadonlyArray<CareReminderRow>,
  now: DateTime.Utc
): Standing => {
  const aboutDueDay = isAbout(line.dueDay)
  if (Array.some(slotRows, (row) => !isPending(row) && aboutDueDay(row))) {
    return Standing.Announced()
  }
  if (line.status._tag === 'Overdue') return Standing.Late()
  const ahead = pipe(
    Option.fromNullishOr(recipient.sendTimes.get(line.dueDay)),
    Option.filter((sendAt) => DateTime.isGreaterThan(sendAt, now))
  )
  if (Option.isSome(ahead)) return Standing.Ahead({ sendAt: ahead.value })
  if (Array.some(slotRows, (row) => isPending(row) && aboutDueDay(row))) {
    return Standing.Late()
  }
  return pipe(
    Array.filter(handedOver, aboutDueDay),
    Array.map((row) => row.scheduledAt),
    Array.sort(DateTime.Order),
    Array.head,
    Option.match({
      onNone: () => Standing.Late(),
      onSome: (sendAt) => Standing.HandedOver({ sendAt }),
    })
  )
}

const planSlot = (
  plantId: string,
  line: CareLine,
  recipient: Recipient,
  slotRows: ReadonlyArray<CareReminderRow>,
  handedOver: ReadonlyArray<CareReminderRow>,
  now: DateTime.Utc
): ReadonlyArray<Change> => {
  const aboutDueDay = isAbout(line.dueDay)
  const pending = Array.filter(slotRows, isPending)
  const current = Array.filter(pending, aboutDueDay)
  const mine = Array.head(current)
  const superseded = remove(
    [
      ...Array.filter(pending, (row) => !aboutDueDay(row)),
      ...Array.drop(current, 1),
    ],
    'superseded'
  )
  const pendingAt = (sendAt: DateTime.Utc): ReadonlyArray<Change> =>
    Option.match(mine, {
      onNone: () => [
        ...superseded,
        Change.Put({
          userId: recipient.id,
          plantId,
          type: reminderTypeOf(line.careType),
          occasion: line.dueDay,
          scheduledAt: sendAt,
        }),
      ],
      onSome: (row) =>
        settledByDelivery(row, now) ||
        DateTime.Equivalence(row.scheduledAt, sendAt)
          ? superseded
          : [
              ...superseded,
              Change.Retime({
                rowId: row.id,
                userId: recipient.id,
                occasion: line.dueDay,
                scheduledAt: sendAt,
              }),
            ],
    })
  return Standing.$match(
    standingOf(line, recipient, slotRows, handedOver, now),
    {
      Announced: () => remove(pending, 'already-announced'),
      Ahead: ({ sendAt }) => pendingAt(sendAt),
      HandedOver: ({ sendAt }) => pendingAt(sendAt),
      Late: () => superseded,
    }
  )
}

const planEntitled = (
  plant: PlantState,
  recipient: Recipient,
  rows: ReadonlyArray<ReminderRow>,
  handedOver: ReadonlyArray<ReminderRow>,
  now: DateTime.Utc
): ReadonlyArray<Change> => {
  const pending = Array.filter(rows, isPending)
  const lines = linesOf(plant)
  const scheduled = Array.flatMap(lines, (line) => {
    const ofLine = (row: ReminderRow): row is CareReminderRow =>
      row.type === reminderTypeOf(line.careType)
    return planSlot(
      plant.id,
      line,
      recipient,
      Array.filter(rows, ofLine),
      Array.filter(handedOver, ofLine),
      now
    )
  })
  const unscheduled = Array.filter(
    pending,
    (row) =>
      row.type !== 'overdue_reminder' &&
      !Array.some(lines, (line) => reminderTypeOf(line.careType) === row.type)
  )
  const settledOverdue = hasOverdueCare(plant)
    ? []
    : Array.filter(pending, (row) => row.type === 'overdue_reminder')
  return [
    ...scheduled,
    ...remove(unscheduled, 'no-schedule'),
    ...remove(settledOverdue, 'no-longer-overdue'),
  ]
}

export const planPlant = (
  plant: PlantState,
  recipients: ReadonlyMap<string, Recipient>,
  now: DateTime.Utc
): ReadonlyArray<Change> => {
  const handedOver = plant.shared
    ? []
    : Array.filter(
        plant.rows,
        (row) => isWaiting(row) && !Array.contains(plant.audience, row.userId)
      )
  return pipe(
    [...plant.audience, ...Array.map(plant.rows, (row) => row.userId)],
    Array.dedupe,
    Array.flatMap((userId) => {
      const rows = Array.filter(plant.rows, (row) => row.userId === userId)
      return Option.match(barredBy(plant, userId, recipients, now), {
        onSome: (why) => remove(Array.filter(rows, isWaiting), why),
        onNone: () =>
          pipe(
            Option.fromNullishOr(recipients.get(userId)),
            Option.match({
              onNone: () => [],
              onSome: (recipient) =>
                planEntitled(plant, recipient, rows, handedOver, now),
            })
          ),
      })
    })
  )
}

export const onlyFor = (
  changes: ReadonlyArray<Change>,
  userId: Option.Option<string>
): ReadonlyArray<Change> =>
  Option.match(userId, {
    onNone: () => changes,
    onSome: (id) => Array.filter(changes, (change) => change.userId === id),
  })
