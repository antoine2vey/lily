import { getTableName, type Table } from 'drizzle-orm'
import { Data, Effect } from 'effect'

/**
 * A store write that touched another number of rows than its decision named.
 * The decision named them from rows the command holds locked, so this is a
 * bug in the store or the load, never a race to answer.
 */
export class RowsNotWrittenDefect extends Data.TaggedError(
  'RowsNotWrittenDefect'
)<{
  readonly table: string
  readonly write: { readonly _tag: string }
  readonly expected: number
  readonly written: number
}> {
  override get message() {
    return `${this.write._tag} wrote ${this.written} of ${this.expected} rows of ${this.table}`
  }
}

/** Dies with `RowsNotWrittenDefect` unless `write` returned `expected` rows. */
export const expectWritten =
  (table: Table, write: { readonly _tag: string }, expected = 1) =>
  (rows: ReadonlyArray<unknown>): Effect.Effect<void> =>
    rows.length === expected
      ? Effect.void
      : Effect.die(
          new RowsNotWrittenDefect({
            table: getTableName(table),
            write,
            expected,
            written: rows.length,
          })
        )
