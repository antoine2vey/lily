import type { Rating } from '@lily/shared'
import { sql } from 'drizzle-orm'
import { check, integer, type PgColumn } from 'drizzle-orm/pg-core'

export const rating = (name: string) => integer(name).$type<Rating>().notNull()

export const ratingRange = (table: string, column: PgColumn) =>
  check(`${table}_${column.name}_range`, sql`${column} BETWEEN 0 AND 100`)
