import { plants } from '@lily/db/schema/plants'
import { users } from '@lily/db/schema/users'
import { relations } from 'drizzle-orm'
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const rooms = pgTable('rooms', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  icon: text('icon').notNull().default('🏠'),
  luminosity: integer('luminosity'),
  isOutdoor: boolean('is_outdoor').notNull().default(false),
  order: integer('order').notNull().default(0),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  user: one(users, { fields: [rooms.userId], references: [users.id] }),
  plants: many(plants),
}))
