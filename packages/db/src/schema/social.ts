import { users } from '@lily/db/schema/users'
import { relations } from 'drizzle-orm'
import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const userFollows = pgTable(
  'user_follows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    followerId: uuid('follower_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followingId: uuid('following_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('user_follows_follower_following_idx').on(
      table.followerId,
      table.followingId
    ),
  ]
)

export const userFollowsRelations = relations(userFollows, ({ one }) => ({
  follower: one(users, {
    fields: [userFollows.followerId],
    references: [users.id],
    relationName: 'follower',
  }),
  following: one(users, {
    fields: [userFollows.followingId],
    references: [users.id],
    relationName: 'following',
  }),
}))

export const userNudges = pgTable(
  'user_nudges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fromUserId: uuid('from_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    toUserId: uuid('to_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('user_nudges_from_user_id_idx').on(table.fromUserId),
    index('user_nudges_to_user_id_idx').on(table.toUserId),
  ]
)

export const userNudgesRelations = relations(userNudges, ({ one }) => ({
  fromUser: one(users, {
    fields: [userNudges.fromUserId],
    references: [users.id],
    relationName: 'nudgesSent',
  }),
  toUser: one(users, {
    fields: [userNudges.toUserId],
    references: [users.id],
    relationName: 'nudgesReceived',
  }),
}))
