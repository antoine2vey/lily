import { chatMessages } from '@lily/db/schema/chat'
import { diagnoses } from '@lily/db/schema/diagnoses'
import {
  carePlanSourceEnum,
  carePlanStatusEnum,
  careTypeEnum,
} from '@lily/db/schema/enums'
import { careLogs } from '@lily/db/schema/plant-history'
import { plants } from '@lily/db/schema/plants'
import { users } from '@lily/db/schema/users'
import { relations } from 'drizzle-orm'
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

// A care plan is a one-off, ordered checklist for a single plant. Plans are
// proposed by the chat assistant (source 'ai') and become visible on the Care
// tab once the owner accepts them. Steps that carry a `careType` bridge into
// the recurring schedule model: accepting moves `nextCareAt`, completing runs
// the regular care flow and records the resulting care log on the step.
export const carePlans = pgTable(
  'care_plans',
  {
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
    diagnosisId: uuid('diagnosis_id').references(() => diagnoses.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    source: carePlanSourceEnum('source').notNull().default('ai'),
    status: carePlanStatusEnum('status').notNull().default('proposed'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('care_plans_user_status_idx').on(table.userId, table.status),
    index('care_plans_plant_id_idx').on(table.plantId),
  ]
)

export const carePlanSteps = pgTable(
  'care_plan_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => carePlans.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    careType: careTypeEnum('care_type'),
    dueDate: timestamp('due_date', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    careLogId: uuid('care_log_id').references(() => careLogs.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('care_plan_steps_plan_id_idx').on(table.planId)]
)

export const carePlansRelations = relations(carePlans, ({ one, many }) => ({
  plant: one(plants, {
    fields: [carePlans.plantId],
    references: [plants.id],
  }),
  user: one(users, {
    fields: [carePlans.userId],
    references: [users.id],
  }),
  diagnosis: one(diagnoses, {
    fields: [carePlans.diagnosisId],
    references: [diagnoses.id],
  }),
  steps: many(carePlanSteps),
}))

export const carePlanStepsRelations = relations(carePlanSteps, ({ one }) => ({
  plan: one(carePlans, {
    fields: [carePlanSteps.planId],
    references: [carePlans.id],
  }),
  careLog: one(careLogs, {
    fields: [carePlanSteps.careLogId],
    references: [careLogs.id],
  }),
}))
