import * as schema from '@lily/db/schema'
import { type Column, getTableColumns, getTableName, is } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import { Array, Record } from 'effect'

export interface SchemaColumn {
  readonly table: string
  readonly column: Column
}

const exported: ReadonlyArray<unknown> = Record.values(schema)
const tables = Array.filter(exported, (value): value is PgTable =>
  is(value, PgTable)
)

/** Every column of every table `@lily/db/schema` declares. */
export const SCHEMA_COLUMNS: ReadonlyArray<SchemaColumn> = Array.flatMap(
  tables,
  (table) =>
    Array.map(Record.values(getTableColumns(table)), (column) => ({
      table: getTableName(table),
      column,
    }))
)
