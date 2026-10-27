import { canopies } from '@lily/db/schema/canopy'
import { plants } from '@lily/db/schema/plants'
import { users } from '@lily/db/schema/users'
import type { Orientation } from '@lily/shared'
import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const rooms = pgTable(
  'rooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    icon: text('icon').notNull().default('🏠'),
    luminosity: integer('luminosity'),
    // Branded to the shared Orientation literal union (8-point compass). The DB
    // column is plain text; values are validated at the schema boundary on write.
    orientation: text('orientation').$type<Orientation>(),
    isOutdoor: boolean('is_outdoor').notNull().default(false),
    order: integer('order').notNull().default(0),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    canopyId: uuid('canopy_id').references(() => canopies.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'rooms_one_owner',
      sql`num_nonnulls(${table.userId}, ${table.canopyId}) = 1`
    ),
  ]
)

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  user: one(users, { fields: [rooms.userId], references: [users.id] }),
  canopy: one(canopies, {
    fields: [rooms.canopyId],
    references: [canopies.id],
  }),
  plants: many(plants),
}))
