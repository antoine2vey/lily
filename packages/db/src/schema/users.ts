import { userAchievements } from '@lily/db/schema/achievements'
import { accounts, sessions } from '@lily/db/schema/auth'
import { userRoleEnum, userStatusEnum } from '@lily/db/schema/enums'
import { deviceTokens, notifications } from '@lily/db/schema/notifications'
import { plants } from '@lily/db/schema/plants'
import {
  subscriptionEvents,
  subscriptionUsage,
  userSubscriptions,
} from '@lily/db/schema/subscriptions'
import { relations } from 'drizzle-orm'
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  emailVerified: boolean('email_verified').notNull(),
  image: text('image'),
  bio: text('bio'),
  soilAlerts: boolean('soil_alerts').notNull().default(true),
  wateringReminders: boolean('watering_reminders').notNull().default(true),
  ads: boolean('ads').notNull().default(false),
  historyViewCount: integer('history_view_count').notNull().default(0),
  role: userRoleEnum('role').notNull().default('user'),
  status: userStatusEnum('status').notNull().default('active'),
})

export const usersRelations = relations(users, ({ many, one }) => ({
  plants: many(plants),
  notifications: many(notifications),
  deviceTokens: many(deviceTokens),
  sessions: many(sessions),
  accounts: many(accounts),
  achievements: many(userAchievements),
  subscription: one(userSubscriptions),
  subscriptionUsage: many(subscriptionUsage),
  subscriptionEvents: many(subscriptionEvents),
}))
