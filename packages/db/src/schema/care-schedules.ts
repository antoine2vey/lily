import { careTypeEnum } from '@lily/db/schema/enums'
import { plants } from '@lily/db/schema/plants'
import { relations, sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  integer,
  pgTable,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

export const plantCareSchedules = pgTable(
  'plant_care_schedules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    careType: careTypeEnum('care_type').notNull(),
    frequencyDays: integer('frequency_days').notNull(),
    lastCareAt: timestamp('last_care_at', { withTimezone: true }),
    nextCareAt: timestamp('next_care_at', { withTimezone: true }).notNull(),
    dueDay: date('due_day').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique('plant_care_schedules_plant_type_uniq').on(
      table.plantId,
      table.careType
    ),
    index('plant_care_schedules_plant_id_idx').on(table.plantId),
    index('plant_care_schedules_next_care_at_idx').on(table.nextCareAt),
    index('plant_care_schedules_due_day_idx').on(table.dueDay),
    check(
      'plant_care_schedules_frequency_days_min',
      sql`${table.frequencyDays} >= 1`
    ),
  ]
)

export const plantCareSchedulesRelations = relations(
  plantCareSchedules,
  ({ one }) => ({
    plant: one(plants, {
      fields: [plantCareSchedules.plantId],
      references: [plants.id],
    }),
  })
)
