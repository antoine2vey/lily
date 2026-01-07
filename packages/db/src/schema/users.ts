import { relations } from 'drizzle-orm'
import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { userAchievements } from './achievements'
import { accounts, sessions } from './auth'
import { deviceTokens, notifications } from './notifications'
import { plants } from './plants'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  emailVerified: boolean('email_verified').notNull(),
  image: text('image'),
})

export const usersRelations = relations(users, ({ many }) => ({
  plants: many(plants),
  notifications: many(notifications),
  deviceTokens: many(deviceTokens),
  sessions: many(sessions),
  accounts: many(accounts),
  achievements: many(userAchievements),
}))
