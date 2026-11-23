import { careLogTypeEnum, scanTypeEnum } from '@lily/db/schema/enums'
import { plants } from '@lily/db/schema/plants'
import { storedRef } from '@lily/db/schema/stored-ref'
import { users } from '@lily/db/schema/users'
import { relations } from 'drizzle-orm'
import {
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const plantPhotos = pgTable(
  'plant_photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    url: storedRef('url').notNull(),
    takenAt: timestamp('taken_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    uploadedByUserId: uuid('uploaded_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    index('plant_photos_uploaded_by_user_id_idx').on(table.uploadedByUserId),
  ]
)

export const plantPhotosRelations = relations(plantPhotos, ({ one }) => ({
  plant: one(plants, {
    fields: [plantPhotos.plantId],
    references: [plants.id],
  }),
  uploadedBy: one(users, {
    fields: [plantPhotos.uploadedByUserId],
    references: [users.id],
  }),
}))

export const careLogs = pgTable(
  'care_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: careLogTypeEnum('type').notNull(),
    notes: text('notes'),
    date: timestamp('date', { withTimezone: true }).notNull().defaultNow(),
    careDay: date('care_day').notNull(),
    photoUrl: storedRef('photo_url'),
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    performedByUserId: uuid('performed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('care_logs_plant_id_idx').on(table.plantId),
    index('care_logs_plant_id_date_idx').on(table.plantId, table.date),
    index('care_logs_performed_by_user_id_idx').on(table.performedByUserId),
    uniqueIndex('care_logs_one_per_care_day').on(
      table.plantId,
      table.type,
      table.careDay
    ),
  ]
)

export const careLogsRelations = relations(careLogs, ({ one }) => ({
  plant: one(plants, {
    fields: [careLogs.plantId],
    references: [plants.id],
  }),
  performedBy: one(users, {
    fields: [careLogs.performedByUserId],
    references: [users.id],
  }),
}))

// Plant scans for SCAN_CHAMP achievement
export const plantScans = pgTable(
  'plant_scans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scanType: scanTypeEnum('scan_type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [index('plant_scans_user_id_idx').on(table.userId)]
)

export const rarePlantIdentifications = pgTable(
  'rare_plant_identifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    imageUrl: storedRef('image_url').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('rare_plant_identifications_user_image_idx').on(
      table.userId,
      table.imageUrl
    ),
  ]
)

export const plantScansRelations = relations(plantScans, ({ one }) => ({
  user: one(users, {
    fields: [plantScans.userId],
    references: [users.id],
  }),
}))
