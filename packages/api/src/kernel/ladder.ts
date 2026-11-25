import { Array, Data, Option, Order, Result } from 'effect'

/**
 * The kinds of lock a transaction waits for, in the one order it may first
 * take each of them.
 *
 * Two locks have no place on it. `SKIP LOCKED` never waits. `FOR KEY SHARE` on
 * an account row has no rank that fits every transaction. The foreign key of
 * any write that names an account takes it without asking, and nothing here
 * sees that. A transaction that deletes notifications and then makes such a
 * write pins the account first, as a canopy leave does.
 */
export const LADDER = [
  'StoreSyncKey',
  'UserKey',
  'Canopy',
  'Delegation',
  'Account',
  'ReminderPlantKey',
  'Invitation',
  'Room',
  'Plant',
  'Conversation',
  'Photo',
  'Notification',
] as const

export type LockKind = (typeof LADDER)[number]

const STRENGTHS = ['key share', 'no key update', 'update'] as const

export type Strength = (typeof STRENGTHS)[number]

export interface Held {
  readonly top: Option.Option<LockKind>
  readonly rows: ReadonlyMap<LockKind, ReadonlyMap<string, Strength>>
}

export const HELD_NOTHING: Held = { top: Option.none(), rows: new Map() }

export class LockOrderDefect extends Data.TaggedError('LockOrderDefect')<{
  readonly wanted: LockKind
  readonly after: LockKind
}> {
  override get message() {
    return `lock order: ${this.wanted} asked after ${this.after}`
  }
}

const rungOf = (kind: LockKind) => LADDER.indexOf(kind)

const byStrength = Order.mapInput(Order.Number, (strength: Strength) =>
  STRENGTHS.indexOf(strength)
)

const alreadyHeld = (
  held: Held,
  kind: LockKind,
  strength: Strength,
  ids: ReadonlyArray<string>
) =>
  Array.every(ids, (id) =>
    Option.exists(
      Option.fromNullishOr(held.rows.get(kind)?.get(id)),
      Order.isGreaterThanOrEqualTo(byStrength)(strength)
    )
  )

/**
 * `held` once `wanted` is taken, or the defect when the transaction holds a
 * kind above `wanted`. Rows it already holds at `strength` or stronger cannot
 * make it wait, so naming only those is allowed anywhere.
 */
export const climb = (
  held: Held,
  wanted: LockKind,
  strength: Strength,
  named: Option.Option<ReadonlyArray<string>>
): Result.Result<Held, LockOrderDefect> =>
  Option.exists(named, (ids) => alreadyHeld(held, wanted, strength, ids))
    ? Result.succeed(held)
    : Option.match(
        Option.filter(held.top, (top) => rungOf(wanted) < rungOf(top)),
        {
          onNone: () => Result.succeed({ ...held, top: Option.some(wanted) }),
          onSome: (after) =>
            Result.fail(new LockOrderDefect({ wanted, after })),
        }
      )

export const holding = (
  held: Held,
  kind: LockKind,
  strength: Strength,
  ids: ReadonlyArray<string>
): Held => {
  const before = held.rows.get(kind) ?? new Map<string, Strength>()
  const strongest = (id: string) =>
    Option.match(Option.fromNullishOr(before.get(id)), {
      onNone: () => strength,
      onSome: Order.max(byStrength)(strength),
    })
  return {
    ...held,
    rows: new Map([
      ...held.rows,
      [
        kind,
        new Map([
          ...before,
          ...Array.map(ids, (id) => [id, strongest(id)] as const),
        ]),
      ],
    ]),
  }
}
