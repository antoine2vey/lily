import { relations } from 'drizzle-orm'
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { careLogTypeEnum } from './enums'
import { plants } from './plants'

export const plantPhotos = pgTable('plant_photos', {
  id: uuid('id').primaryKey().defaultRandom(),
  url: text('url').notNull(),
  takenAt: timestamp('taken_at').notNull().defaultNow(),
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
  date: timestamp('date').notNull().defaultNow(),
  photoUrl: text('photo_url'),
  plantId: uuid('plant_id')
    .notNull()
    .references(() => plants.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const careLogsRelations = relations(careLogs, ({ one }) => ({
  plant: one(plants, {
    fields: [careLogs.plantId],
    references: [plants.id],
  }),
}))
