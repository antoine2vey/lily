import { relations } from 'drizzle-orm'
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { plants } from './plants'

export const wateringHistory = pgTable('watering_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  wateredAt: timestamp('watered_at').notNull().defaultNow(),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  plantId: uuid('plant_id')
    .notNull()
    .references(() => plants.id, { onDelete: 'cascade' }),
})

export const wateringHistoryRelations = relations(
  wateringHistory,
  ({ one }) => ({
    plant: one(plants, {
      fields: [wateringHistory.plantId],
      references: [plants.id],
    }),
  })
)

export const fertilizationHistory = pgTable('fertilization_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  fertilizedAt: timestamp('fertilized_at').notNull().defaultNow(),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  plantId: uuid('plant_id')
    .notNull()
    .references(() => plants.id, { onDelete: 'cascade' }),
})

export const fertilizationHistoryRelations = relations(
  fertilizationHistory,
  ({ one }) => ({
    plant: one(plants, {
      fields: [fertilizationHistory.plantId],
      references: [plants.id],
    }),
  })
)

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
