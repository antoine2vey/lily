import { delegationStatusEnum } from '@lily/db/schema/enums'
import { plants } from '@lily/db/schema/plants'
import { users } from '@lily/db/schema/users'
import { relations } from 'drizzle-orm'
import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const careDelegations = pgTable('care_delegations', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  caretakerId: uuid('caretaker_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: delegationStatusEnum('status').notNull().default('pending'),
  message: text('message'),
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const delegationPlants = pgTable(
  'delegation_plants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    delegationId: uuid('delegation_id')
      .notNull()
      .references(() => careDelegations.id, { onDelete: 'cascade' }),
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('delegation_plants_delegation_plant_idx').on(
      table.delegationId,
      table.plantId
    ),
  ]
)

export const careDelegationsRelations = relations(
  careDelegations,
  ({ one, many }) => ({
    owner: one(users, {
      fields: [careDelegations.ownerId],
      references: [users.id],
      relationName: 'delegationsAsOwner',
    }),
    caretaker: one(users, {
      fields: [careDelegations.caretakerId],
      references: [users.id],
      relationName: 'delegationsAsCaretaker',
    }),
    plants: many(delegationPlants),
  })
)

export const delegationPlantsRelations = relations(
  delegationPlants,
  ({ one }) => ({
    delegation: one(careDelegations, {
      fields: [delegationPlants.delegationId],
      references: [careDelegations.id],
    }),
    plant: one(plants, {
      fields: [delegationPlants.plantId],
      references: [plants.id],
    }),
  })
)
