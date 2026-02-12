import { chatMessages } from '@lily/db/schema/chat'
import {
  diagnosisSeverityEnum,
  diagnosisStatusEnum,
} from '@lily/db/schema/enums'
import { plants } from '@lily/db/schema/plants'
import { users } from '@lily/db/schema/users'
import { relations } from 'drizzle-orm'
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const diagnoses = pgTable('diagnoses', {
  id: uuid('id').primaryKey().defaultRandom(),
  plantId: uuid('plant_id')
    .notNull()
    .references(() => plants.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  chatMessageId: uuid('chat_message_id').references(() => chatMessages.id, {
    onDelete: 'set null',
  }),
  diseaseName: text('disease_name').notNull(),
  severity: diagnosisSeverityEnum('severity').notNull(),
  confidence: integer('confidence').notNull(),
  symptoms: jsonb('symptoms').notNull().$type<string[]>(),
  treatmentSteps: jsonb('treatment_steps').notNull().$type<string[]>(),
  preventionTips: jsonb('prevention_tips').$type<string[]>(),
  imageUrl: text('image_url'),
  status: diagnosisStatusEnum('status').notNull().default('ACTIVE'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const diagnosesRelations = relations(diagnoses, ({ one }) => ({
  plant: one(plants, {
    fields: [diagnoses.plantId],
    references: [plants.id],
  }),
  user: one(users, {
    fields: [diagnoses.userId],
    references: [users.id],
  }),
  chatMessage: one(chatMessages, {
    fields: [diagnoses.chatMessageId],
    references: [chatMessages.id],
  }),
}))
