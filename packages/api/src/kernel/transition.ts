import { writeAccount } from '@lily/api/kernel/locks'
import type { PgDrizzle } from '@lily/db/effect-drizzle'
import {
  activityPushTokens,
  blogPosts,
  canopyDirectInvites,
  careDelegations,
  carePlans,
  notifications,
  users,
} from '@lily/db/schema'
import { ingestJobs } from '@lily/knowledge-db/schema'
import { and, eq, inArray, type SQL, sql } from 'drizzle-orm'
import type { PgColumn, PgTable, PgUpdateSetSource } from 'drizzle-orm/pg-core'
import { Array, Data, Effect, Option } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

const machine = <
  Key extends keyof Table['$inferSelect'] & string,
  Table extends PgTable & Record<Key, PgColumn>,
  const Moves extends Record<
    Table['$inferSelect'][Key] & string,
    ReadonlyArray<Table['$inferSelect'][Key] & string>
  >,
>(
  table: Table,
  id: PgColumn,
  key: Key,
  moves: Moves
) => {
  const status: PgColumn = table[key]
  return { table, id, key, status, moves }
}

/**
 * Every status column that moves through known states, with the states each
 * one may move to. To add a status column or a move, add it here. A column
 * that takes whatever an outside authority says (an admin, a store, a
 * device) has no machine: `status-writes.test.ts` fails on a status written
 * outside this file, and names each of those writes with its reason.
 */
const ROW_MACHINES = {
  Delegation: machine(careDelegations, careDelegations.id, 'status', {
    pending: ['accepted', 'rejected', 'canceled'],
    accepted: ['active', 'canceled'],
    active: ['completed', 'canceled'],
    rejected: [],
    canceled: [],
    completed: [],
  }),
  Plan: machine(carePlans, carePlans.id, 'status', {
    proposed: ['accepted', 'dismissed'],
    accepted: ['completed'],
    completed: ['accepted'],
    dismissed: [],
  }),
  Invitation: machine(canopyDirectInvites, canopyDirectInvites.id, 'status', {
    pending: ['accepted', 'declined', 'withdrawn'],
    accepted: [],
    declined: [],
    withdrawn: [],
  }),
  Notification: machine(notifications, notifications.id, 'status', {
    pending: ['queued'],
    queued: ['pending', 'sent', 'failed'],
    sent: [],
    failed: [],
  }),
  ActivityToken: machine(activityPushTokens, activityPushTokens.id, 'status', {
    active: ['ended', 'expired'],
    ended: [],
    expired: [],
  }),
  IngestJob: machine(ingestJobs, ingestJobs.id, 'status', {
    pending: ['in_progress'],
    in_progress: ['pending', 'completed', 'failed'],
    completed: [],
    failed: [],
  }),
  // A post reaches `published` from `rejected` because its commit is pushed
  // before the row moves, so a sweep in between must not hide a live post.
  BlogPost: machine(blogPosts, blogPosts.id, 'status', {
    pending: ['researching', 'rejected'],
    researching: ['generating', 'rejected'],
    generating: ['reviewing', 'rejected'],
    reviewing: ['generating', 'published', 'rejected'],
    rejected: ['published'],
    published: [],
  }),
}

const MACHINES = {
  ...ROW_MACHINES,
  // A new vacation replaces the dates of the one before it, so a state may
  // move to itself.
  Vacation: machine(users, users.id, 'vacationStatus', {
    none: ['none', 'scheduled', 'active'],
    scheduled: ['none', 'scheduled', 'active'],
    active: ['none', 'scheduled', 'active'],
  }),
}

export type MachineName = keyof typeof MACHINES
export type RowMachineName = keyof typeof ROW_MACHINES

type Moves<Name extends MachineName> = (typeof MACHINES)[Name]['moves']
export type StateOf<Name extends MachineName> = keyof Moves<Name> & string
type After<Name extends MachineName, From extends StateOf<Name>> =
  Moves<Name>[From] extends ReadonlyArray<infer To> ? To : never

/** The states every one of `From` may move to. */
export type ReachableFrom<
  Name extends MachineName,
  From extends StateOf<Name>,
> = Exclude<
  StateOf<Name>,
  { [State in From]: Exclude<StateOf<Name>, After<Name, State>> }[From]
>

type TableOf<Name extends MachineName> = (typeof MACHINES)[Name]['table']
export type RowOf<Name extends MachineName> = TableOf<Name>['$inferSelect']
type Stamps<Name extends MachineName> = Omit<
  PgUpdateSetSource<TableOf<Name>>,
  (typeof MACHINES)[Name]['key']
>

interface Narrowing<Name extends MachineName> {
  /** Columns written with the move. The status column is not one of them. */
  readonly also?: Stamps<Name>
  /** Narrows which rows move. The states they move from are `from`. */
  readonly where?: SQL | undefined
}

export interface Move<Name extends MachineName, From extends StateOf<Name>>
  extends Narrowing<Name> {
  readonly from: Array.NonEmptyReadonlyArray<From>
  readonly to: ReachableFrom<Name, From>
}

export interface EitherMove<
  Name extends MachineName,
  From extends StateOf<Name>,
> extends Move<Name, From> {
  /** Read on each row, before the write: true moves the row to `to`. */
  readonly when: SQL
  readonly otherwise: ReachableFrom<Name, From>
}

export interface DecidedMove<Name extends MachineName> extends Narrowing<Name> {
  readonly from: StateOf<Name>
  readonly to: StateOf<Name>
}

/**
 * `LostRace` says no row with that id was in a `from` state when the
 * statement ran: something else moved it first, or it is gone.
 */
export type Transition<Row> = Data.TaggedEnum<{
  Moved: { readonly row: Row }
  LostRace: Record<never, never>
}>

interface TransitionDefinition extends Data.TaggedEnum.WithGenerics<1> {
  readonly taggedEnum: Transition<this['A']>
}
export const Transition = Data.taggedEnum<TransitionDefinition>()

export class IllegalTransitionDefect extends Data.TaggedError(
  'IllegalTransitionDefect'
)<{
  readonly machine: MachineName
  readonly from: string
  readonly to: string
}> {
  override get message() {
    return `${this.machine} cannot move from ${this.from} to ${this.to}`
  }
}

export const isLegal = (
  name: MachineName,
  from: string,
  to: string
): boolean => {
  const moves: Readonly<Record<string, ReadonlyArray<string>>> =
    MACHINES[name].moves
  return Array.contains(moves[from] ?? [], to)
}

type Db = PgDrizzle['Service']

interface Statement {
  readonly from: ReadonlyArray<string>
  readonly to: string | SQL
  readonly also?: Readonly<Record<string, unknown>>
  readonly where?: SQL | undefined
}

const fromStates = (name: MachineName, statement: Statement): SQL => {
  const inFrom = inArray(MACHINES[name].status, [...statement.from])
  return Option.match(Option.fromUndefinedOr(statement.where), {
    onNone: () => inFrom,
    onSome: (more) => sql`${inFrom} and (${more})`,
  })
}

const valuesOf = (name: MachineName, statement: Statement) => ({
  ...statement.also,
  [MACHINES[name].key]: statement.to,
})

const movingRows = (
  db: Db,
  name: RowMachineName,
  which: Option.Option<string>,
  statement: Statement
): Effect.Effect<ReadonlyArray<unknown>, SqlError> => {
  const { table, id } = ROW_MACHINES[name]
  return db
    .update(table)
    .set(valuesOf(name, statement))
    .where(
      and(
        Option.getOrUndefined(Option.map(which, (rowId) => eq(id, rowId))),
        fromStates(name, statement)
      )
    )
    .returning()
}

const movingOne = (
  db: Db,
  name: MachineName,
  id: string,
  statement: Statement
): Effect.Effect<ReadonlyArray<unknown>, SqlError> =>
  name === 'Vacation'
    ? writeAccount(
        db,
        id,
        valuesOf(name, statement),
        (write) => write.returning(),
        fromStates(name, statement)
      )
    : movingRows(db, name, Option.some(id), statement)

// The rows of `UPDATE <table of Name> ... RETURNING *` are that table's rows,
// which the compiler cannot follow through a table picked by name.
const asRowsOf = <Name extends MachineName>(rows: ReadonlyArray<unknown>) =>
  rows as ReadonlyArray<RowOf<Name>>

const one = <Row>(rows: ReadonlyArray<Row>): Transition<Row> =>
  Option.match(Array.head(rows), {
    onNone: () => Transition.LostRace(),
    onSome: (row) => Transition.Moved({ row }),
  })

const eitherOf = (
  name: MachineName,
  move: { readonly when: SQL; readonly to: string; readonly otherwise: string }
): SQL => {
  const type = sql.raw(MACHINES[name].status.getSQLType())
  return sql`CASE WHEN ${move.when} THEN ${move.to}::${type} ELSE ${move.otherwise}::${type} END`
}

/**
 * Moves the row `id` of a machine from one of `from` to `to`, in one
 * `UPDATE ... WHERE status IN (from)`. The statement is built here, so the
 * state a caller read is always the state the write is conditional on, and
 * the result of a write that moved nothing is not the result of one that did.
 * A `to` that some state of `from` may not move to does not compile.
 */
export const transition = <
  Name extends MachineName,
  From extends StateOf<Name>,
>(
  db: Db,
  name: Name,
  id: string,
  move: Move<Name, From>
): Effect.Effect<Transition<RowOf<Name>>, SqlError> =>
  Effect.map(movingOne(db, name, id, move), (rows) => one(asRowsOf<Name>(rows)))

/**
 * `transition` for a pair a domain rule picked at run time, which the
 * compiler cannot check. Dies on a pair the machine does not have.
 */
export const transitionDecided = <Name extends MachineName>(
  db: Db,
  name: Name,
  id: string,
  move: DecidedMove<Name>
): Effect.Effect<Transition<RowOf<Name>>, SqlError> =>
  isLegal(name, move.from, move.to)
    ? Effect.map(
        movingOne(db, name, id, { ...move, from: [move.from] }),
        (rows) => one(asRowsOf<Name>(rows))
      )
    : Effect.die(
        new IllegalTransitionDefect({
          machine: name,
          from: move.from,
          to: move.to,
        })
      )

/**
 * Moves every row `move.where` selects that is in one of `from`, and answers
 * with the rows it moved. A row something else moved first is not among
 * them. An account moves one at a time, through `transition`.
 */
export const transitionEach = <
  Name extends RowMachineName,
  From extends StateOf<Name>,
>(
  db: Db,
  name: Name,
  move: Move<Name, From> & { readonly where: SQL | undefined }
): Effect.Effect<ReadonlyArray<RowOf<Name>>, SqlError> =>
  Effect.map(movingRows(db, name, Option.none(), move), asRowsOf<Name>)

/**
 * `transitionEach` where each row goes to `to` or to `otherwise`, picked by
 * `when` in the one statement that moves them all. Two statements would
 * leave the rows of the second unlocked while the first ran, for a rival to
 * take in the other order.
 */
export const transitionEachEither = <
  Name extends RowMachineName,
  From extends StateOf<Name>,
>(
  db: Db,
  name: Name,
  move: EitherMove<Name, From> & { readonly where: SQL | undefined }
): Effect.Effect<ReadonlyArray<RowOf<Name>>, SqlError> =>
  Effect.map(
    movingRows(db, name, Option.none(), { ...move, to: eitherOf(name, move) }),
    asRowsOf<Name>
  )
