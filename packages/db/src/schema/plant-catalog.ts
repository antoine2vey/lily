import { languageCodeEnum } from '@lily/db/schema/enums'
import { relations } from 'drizzle-orm'
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

export const plantCatalog = pgTable(
  'plant_catalog',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scientificName: text('scientific_name'),
    family: text('family'),
    category: text('category'),
    imageUrl: text('image_url'),

    // Care frequencies (days)
    wateringFrequencyDays: integer('watering_frequency_days').notNull(),
    fertilizationFrequencyDays: integer('fertilization_frequency_days'),
    mistingFrequencyDays: integer('misting_frequency_days'),
    repottingFrequencyDays: integer('repotting_frequency_days'),

    // Ratings (0-100 scale)
    humidityRating: integer('humidity_rating').notNull(),
    lightingRating: integer('lighting_rating').notNull(),
    petToxicityRating: integer('pet_toxicity_rating').notNull(),
    wateringRating: integer('watering_rating').notNull(),

    // Light requirement in lux (raw value for scanner matching)
    luxNeeded: integer('lux_needed'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('plant_catalog_category_idx').on(table.category)]
)

export const plantCatalogTranslations = pgTable(
  'plant_catalog_translations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    catalogId: uuid('catalog_id')
      .notNull()
      .references(() => plantCatalog.id, { onDelete: 'cascade' }),
    language: languageCodeEnum('language').notNull(),
    name: text('name').notNull(),
    description: text('description'),
  },
  (table) => [
    unique('plant_catalog_translations_unique').on(
      table.catalogId,
      table.language
    ),
    index('plant_catalog_translations_name_idx').on(table.name),
    index('plant_catalog_translations_lang_idx').on(table.language),
  ]
)

export const plantCatalogRelations = relations(plantCatalog, ({ many }) => ({
  translations: many(plantCatalogTranslations),
}))

export const plantCatalogTranslationsRelations = relations(
  plantCatalogTranslations,
  ({ one }) => ({
    catalog: one(plantCatalog, {
      fields: [plantCatalogTranslations.catalogId],
      references: [plantCatalog.id],
    }),
  })
)
