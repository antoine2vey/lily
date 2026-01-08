import { userAchievements } from '@lily/db/schema/achievements'
import { accounts, sessions } from '@lily/db/schema/auth'
import { deviceTokens, notifications } from '@lily/db/schema/notifications'
import { plants } from '@lily/db/schema/plants'
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
})

export const usersRelations = relations(users, ({ many }) => ({
  plants: many(plants),
  notifications: many(notifications),
  deviceTokens: many(deviceTokens),
  sessions: many(sessions),
  accounts: many(accounts),
  achievements: many(userAchievements),
}))
