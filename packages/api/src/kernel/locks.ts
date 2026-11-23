import {
  climb,
  holding,
  type LockKind,
  type Strength,
} from '@lily/api/kernel/ladder'
import { Transaction } from '@lily/api/kernel/transact'
import type { PgDrizzle } from '@lily/db/effect-drizzle'
import {
  canopies,
  canopyDirectInvites,
  careDelegations,
  chatConversations,
  notifications,
  plantPhotos,
  plants,
  rooms,
  users,
} from '@lily/db/schema'
import { and, asc, eq, getTableColumns, type SQL } from 'drizzle-orm'
import {
  getTableConfig,
  type PgColumn,
  type PgTable,
  type PgUpdateSetSource,
} from 'drizzle-orm/pg-core'
import { Array, Effect, Option, Predicate, Record, Ref, Result } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

const OWNER_LOCK_KEYSPACE = 1
const REMINDER_PLANT_KEYSPACE = 2

const ROWS = {
  Canopy: { table: canopies, id: canopies.id },
  Delegation: { table: careDelegations, id: careDelegations.id },
  Account: { table: users, id: users.id },
  Invitation: { table: canopyDirectInvites, id: canopyDirectInvites.id },
  Room: { table: rooms, id: rooms.id },
  Plant: { table: plants, id: plants.id },
  Conversation: { table: chatConversations, id: chatConversations.id },
  Photo: { table: plantPhotos, id: plantPhotos.id },
  Notification: { table: notifications, id: notifications.id },
} satisfies Partial<Record<LockKind, { table: PgTable; id: PgColumn }>>

export type RowKind = keyof typeof ROWS

interface Lockable<Locked> {
  readonly orderBy: (id: SQL) => {
    readonly for: (strength: Strength, config: { of: PgTable }) => Locked
  }
}

/**
 * Takes `wanted` on the ladder of the open transaction and dies when `climb`
 * refuses it. With no transaction a lock lasts one statement, so there is no
 * order to keep.
 */
const climbing = <A, E, R>(
  wanted: LockKind,
  strength: Strength,
  named: Option.Option<ReadonlyArray<string>>,
  take: Effect.Effect<A, E, R>,
  taken: (a: A) => ReadonlyArray<string>
): Effect.Effect<A, E, R> =>
  Effect.flatMap(Effect.serviceOption(Transaction), (transaction) =>
    Option.match(
      Option.flatMap(transaction, (open) => open.held),
      {
        onNone: () => take,
        onSome: (held) =>
          Effect.gen(function* () {
            const before = yield* Ref.get(held)
            const after = yield* Result.match(
              climb(before, wanted, strength, named),
              { onFailure: Effect.die, onSuccess: Effect.succeed }
            )
            yield* Ref.set(held, after)
            const a = yield* take
            yield* Ref.update(held, (now) =>
              holding(now, wanted, strength, taken(a))
            )
            return a
          }),
      }
    )
  )

const inIdOrder = <Locked>(
  kind: RowKind,
  strength: Strength,
  query: Lockable<Locked>
) => query.orderBy(asc(ROWS[kind].id)).for(strength, { of: ROWS[kind].table })

/**
 * Locks the rows `query` selects, in id order, and holds them to the end of
 * the transaction. Which rows those are is not known before the lock returns,
 * so this always dies below the top kind the transaction holds.
 */
export const lockRows = <Row extends { readonly id: string }, E, R>(
  kind: RowKind,
  strength: Strength,
  query: Lockable<Effect.Effect<ReadonlyArray<Row>, E, R>>
): Effect.Effect<ReadonlyArray<Row>, E, R> =>
  climbing(
    kind,
    strength,
    Option.none(),
    inIdOrder(kind, strength, query),
    Array.map((row) => row.id)
  )

/**
 * `lockRows` for a query that selects exactly the rows `ids` names. Rows the
 * transaction already holds may be named again at any point.
 */
export const lockRowsNamed = <Row, E, R>(
  kind: RowKind,
  strength: Strength,
  ids: ReadonlyArray<string>,
  query: Lockable<Effect.Effect<ReadonlyArray<Row>, E, R>>
): Effect.Effect<ReadonlyArray<Row>, E, R> =>
  climbing(
    kind,
    strength,
    Option.some(ids),
    inIdOrder(kind, strength, query),
    () => ids
  )

/**
 * The locking form of `query`, for a write that locks its rows in a
 * subquery: `DELETE ... WHERE id IN (SELECT ... FOR UPDATE)`.
 */
export const rowsToLock = <Locked>(
  kind: RowKind,
  strength: Strength,
  query: Lockable<Locked>
): Effect.Effect<Locked> =>
  climbing(
    kind,
    strength,
    Option.none(),
    Effect.sync(() => inIdOrder(kind, strength, query)),
    () => []
  )

/**
 * Reads account rows `FOR KEY SHARE`, in id order, so none can be erased
 * before the transaction ends. Off the ladder, as `LADDER` explains: take it
 * where the pair of transactions it guards against needs it.
 */
export const pinAccounts = <Pinned>(query: Lockable<Pinned>): Pinned =>
  inIdOrder('Account', 'key share', query)

const ACCOUNT_COLUMNS = getTableColumns(users)

const accountKeyColumns: ReadonlySet<string> = (() => {
  const table = getTableConfig(users)
  return new Set([
    ...Array.flatMap(table.columns, (column) =>
      column.primary || column.isUnique ? [column.name] : []
    ),
    ...Array.flatMap(table.primaryKeys, (key) =>
      Array.map(key.columns, (column) => column.name)
    ),
    ...Array.flatMap(table.uniqueConstraints, (constraint) =>
      Array.map(constraint.columns, (column) => column.name)
    ),
    ...Array.flatMap(table.indexes, (index) =>
      index.config.unique
        ? Array.flatMap(index.config.columns, (column) =>
            'name' in column && Predicate.isString(column.name)
              ? [column.name]
              : []
          )
        : []
    ),
  ])
})()

/**
 * The lock an `UPDATE` of an account row takes for `values`: `FOR UPDATE`
 * when it sets a column of a key or of a unique index, which a foreign key
 * may point at, and `FOR NO KEY UPDATE` otherwise.
 */
export const accountWriteStrength = (
  values: Readonly<Record<string, unknown>>
): Strength =>
  Array.some(
    Record.toEntries(ACCOUNT_COLUMNS),
    ([property, column]) =>
      values[property] !== undefined && accountKeyColumns.has(column.name)
  )
    ? 'update'
    : 'no key update'

type Db = PgDrizzle['Service']

const updatingAccount = (
  db: Db,
  userId: string,
  values: PgUpdateSetSource<typeof users>,
  also: SQL | undefined
) =>
  db
    .update(users)
    .set(values)
    .where(and(eq(users.id, userId), also))

/**
 * An `UPDATE` of an account row locks it without asking. This is the one
 * place that writes one, and it writes the row of `userId` only, so that
 * lock climbs the ladder like one that was asked for, at the strength
 * `values` gives it. `also` narrows the write further. `finish` says what
 * the statement returns.
 */
export const writeAccount = <A, E, R>(
  db: Db,
  userId: string,
  values: PgUpdateSetSource<typeof users>,
  finish: (write: ReturnType<typeof updatingAccount>) => Effect.Effect<A, E, R>,
  also?: SQL
): Effect.Effect<A, E, R> =>
  climbing(
    'Account',
    accountWriteStrength(values),
    Option.some([userId]),
    Effect.suspend(() => finish(updatingAccount(db, userId, values, also))),
    () => [userId]
  )

const advisory = (
  kind: 'UserKey' | 'ReminderPlantKey',
  keyspace: number,
  ids: ReadonlyArray<string>
): Effect.Effect<void, SqlError, SqlClient.SqlClient | Transaction> =>
  Effect.flatMap(Effect.all([SqlClient.SqlClient, Transaction]), ([sql]) => {
    const named = sql.join(
      ', ',
      false
    )(Array.map(ids, (id) => sql`(${id}::text)`))
    return climbing(
      kind,
      'update',
      Option.some(ids),
      Effect.asVoid(
        sql`SELECT pg_advisory_xact_lock(${keyspace}, key) FROM (SELECT DISTINCT hashtext(named.id) AS key FROM (VALUES ${named}) AS named(id) ORDER BY 1) AS keys`
      ),
      () => ids
    )
  })

/**
 * The per-user advisory lock of every user a transaction names, in one
 * statement and in key order, held to the end of the transaction.
 * Everything that adds a living plant to a user, opens a delegation for a
 * user, or gives a user a Canopy membership takes it first, so each of them
 * reads counts and memberships that cannot move before it commits. An
 * account deletion takes it first too. So the deletion finds every
 * membership and delegation of the user, and whoever would add one behind it
 * finds no account.
 */
export const lockUsers = (
  userIds: Array.NonEmptyReadonlyArray<string>
): Effect.Effect<void, SqlError, SqlClient.SqlClient | Transaction> =>
  advisory('UserKey', OWNER_LOCK_KEYSPACE, userIds)

export const lockUser = (
  userId: string
): Effect.Effect<void, SqlError, SqlClient.SqlClient | Transaction> =>
  lockUsers([userId])

/**
 * The advisory lock of each plant whose reminders a replan rewrites, so two
 * replans of one plant run one after the other.
 */
export const lockReminderPlants = (
  plantIds: ReadonlyArray<string>
): Effect.Effect<void, SqlError, SqlClient.SqlClient | Transaction> =>
  Array.isReadonlyArrayEmpty(plantIds)
    ? Effect.void
    : advisory('ReminderPlantKey', REMINDER_PLANT_KEYSPACE, plantIds)
