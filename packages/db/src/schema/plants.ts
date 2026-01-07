import { relations } from 'drizzle-orm'
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { plantHealthEnum } from './enums'
import { notifications } from './notifications'
import { careLogs, plantPhotos } from './plant-history'
import { users } from './users'

export const plants = pgTable('plants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  imageUrl: text('image_url'),
  category: text('category'),
  dateAdded: timestamp('date_added').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  humidityRating: integer('humidity_rating').notNull(),
  lightingRating: integer('lighting_rating').notNull(),
  petToxicityRating: integer('pet_toxicity_rating').notNull(),
  wateringRating: integer('watering_rating').notNull(),
  health: plantHealthEnum('health').notNull().default('HEALTHY'),
  wateringFrequencyDays: integer('watering_frequency_days').notNull(),
  lastWateredAt: timestamp('last_watered_at'),
  nextWateringAt: timestamp('next_watering_at'),
  fertilizationFrequencyDays: integer('fertilization_frequency_days'),
  lastFertilizedAt: timestamp('last_fertilized_at'),
  nextFertilizationAt: timestamp('next_fertilization_at'),
  remindersEnabled: boolean('reminders_enabled').notNull().default(true),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
})

export const plantsRelations = relations(plants, ({ one, many }) => ({
  user: one(users, { fields: [plants.userId], references: [users.id] }),
  notifications: many(notifications),
  careLogs: many(careLogs),
  photos: many(plantPhotos),
}))
