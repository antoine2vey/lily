import { careLogTypeEnum } from '@lily/db/schema/enums'
import { plants } from '@lily/db/schema/plants'
import { users } from '@lily/db/schema/users'
import { relations } from 'drizzle-orm'
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const plantPhotos = pgTable('plant_photos', {
  id: uuid('id').primaryKey().defaultRandom(),
  url: text('url').notNull(),
  takenAt: timestamp('taken_at', { withTimezone: true }).notNull().defaultNow(),
  plantId: uuid('plant_id')
    .notNull()
    .references(() => plants.id, { onDelete: 'cascade' }),
})

export const plantPhotosRelations = relations(plantPhotos, ({ one }) => ({
  plant: one(plants, {
    fields: [plantPhotos.plantId],
    references: [plants.id],
  }),
}))

// Unified care logs table
export const careLogs = pgTable('care_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: careLogTypeEnum('type').notNull(),
  notes: text('notes'),
  date: timestamp('date', { withTimezone: true }).notNull().defaultNow(),
  photoUrl: text('photo_url'),
  plantId: uuid('plant_id')
    .notNull()
    .references(() => plants.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const careLogsRelations = relations(careLogs, ({ one }) => ({
  plant: one(plants, {
    fields: [careLogs.plantId],
    references: [plants.id],
  }),
}))

// Plant scans for SCAN_CHAMP achievement
export const plantScans = pgTable('plant_scans', {
  id: uuid('id').primaryKey().defaultRandom(),
  scanType: text('scan_type').notNull(), // 'card' | 'identify'
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
})

export const plantScansRelations = relations(plantScans, ({ one }) => ({
  user: one(users, {
    fields: [plantScans.userId],
    references: [users.id],
  }),
}))
