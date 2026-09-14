import { plantCareSchedules } from '@lily/db/schema/care-schedules'
import { delegationPlants } from '@lily/db/schema/delegation'
import { diagnoses } from '@lily/db/schema/diagnoses'
import { plantDeathCauseEnum, plantHealthEnum } from '@lily/db/schema/enums'
import { notifications } from '@lily/db/schema/notifications'
import { careLogs, plantPhotos } from '@lily/db/schema/plant-history'
import { rooms } from '@lily/db/schema/rooms'
import { users } from '@lily/db/schema/users'
import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const plants = pgTable(
  'plants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    imageUrl: text('image_url'),
    category: text('category'),
    dateAdded: timestamp('date_added', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    humidityRating: integer('humidity_rating').notNull(),
    lightingRating: integer('lighting_rating').notNull(),
    petToxicityRating: integer('pet_toxicity_rating').notNull(),
    wateringRating: integer('watering_rating').notNull(),
    health: plantHealthEnum('health').notNull().default('HEALTHY'),
    remindersEnabled: boolean('reminders_enabled').notNull().default(true),
    isFavorite: boolean('is_favorite').notNull().default(false),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    potWidthCm: doublePrecision('pot_width_cm'),
    potHeightCm: doublePrecision('pot_height_cm'),
    roomId: uuid('room_id').references(() => rooms.id, {
      onDelete: 'set null',
    }),
    // A dead plant stays in the collection (history, photos, cemetery) but is
    // excluded from every care/notification path. `diedAt === null` is the
    // canonical "living" predicate — see api/repositories/helpers/living-plant.
    diedAt: timestamp('died_at', { withTimezone: true }),
    deathCause: plantDeathCauseEnum('death_cause'),
    deathNote: text('death_note'),
  },
  (table) => [
    index('plants_user_id_idx').on(table.userId),
    index('plants_room_id_idx').on(table.roomId),
    index('plants_user_id_living_idx')
      .on(table.userId)
      .where(sql`${table.diedAt} IS NULL`),
  ]
)

export const plantsRelations = relations(plants, ({ one, many }) => ({
  user: one(users, { fields: [plants.userId], references: [users.id] }),
  room: one(rooms, { fields: [plants.roomId], references: [rooms.id] }),
  notifications: many(notifications),
  careLogs: many(careLogs),
  photos: many(plantPhotos),
  diagnoses: many(diagnoses),
  delegations: many(delegationPlants),
  careSchedules: many(plantCareSchedules),
}))
