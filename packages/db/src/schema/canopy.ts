import { canopyMemberRoleEnum } from '@lily/db/schema/enums'
import { plants } from '@lily/db/schema/plants'
import { rooms } from '@lily/db/schema/rooms'
import { users } from '@lily/db/schema/users'
import { relations, sql } from 'drizzle-orm'
import {
  doublePrecision,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const canopies = pgTable('canopies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull().default('UTC'),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const canopyMembers = pgTable(
  'canopy_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    canopyId: uuid('canopy_id')
      .notNull()
      .references(() => canopies.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: canopyMemberRoleEnum('role').notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('canopy_members_user_id_unique').on(table.userId),
    index('canopy_members_canopy_id_idx').on(table.canopyId),
    uniqueIndex('canopy_members_one_owner_unique')
      .on(table.canopyId)
      .where(sql`${table.role} = 'owner'`),
  ]
)

export const canopyInvites = pgTable(
  'canopy_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    canopyId: uuid('canopy_id')
      .notNull()
      .references(() => canopies.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('canopy_invites_one_live_unique')
      .on(table.canopyId)
      .where(sql`${table.revokedAt} IS NULL`),
  ]
)

export const canopyPlantMutes = pgTable(
  'canopy_plant_mutes',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.plantId] })]
)

export const canopiesRelations = relations(canopies, ({ many }) => ({
  members: many(canopyMembers),
  invites: many(canopyInvites),
  plants: many(plants),
  rooms: many(rooms),
}))

export const canopyMembersRelations = relations(canopyMembers, ({ one }) => ({
  canopy: one(canopies, {
    fields: [canopyMembers.canopyId],
    references: [canopies.id],
  }),
  user: one(users, {
    fields: [canopyMembers.userId],
    references: [users.id],
  }),
}))

export const canopyInvitesRelations = relations(canopyInvites, ({ one }) => ({
  canopy: one(canopies, {
    fields: [canopyInvites.canopyId],
    references: [canopies.id],
  }),
  createdBy: one(users, {
    fields: [canopyInvites.createdByUserId],
    references: [users.id],
  }),
}))

export const canopyPlantMutesRelations = relations(
  canopyPlantMutes,
  ({ one }) => ({
    user: one(users, {
      fields: [canopyPlantMutes.userId],
      references: [users.id],
    }),
    plant: one(plants, {
      fields: [canopyPlantMutes.plantId],
      references: [plants.id],
    }),
  })
)
