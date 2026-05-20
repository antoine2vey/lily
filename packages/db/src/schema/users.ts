import { userAchievements } from '@lily/db/schema/achievements'
import { magicLinks, refreshTokens } from '@lily/db/schema/auth'
import { careDelegations } from '@lily/db/schema/delegation'
import {
  languageCodeEnum,
  temperatureUnitEnum,
  userRoleEnum,
  userStatusEnum,
} from '@lily/db/schema/enums'
import { deviceTokens, notifications } from '@lily/db/schema/notifications'
import { oauthIdentities } from '@lily/db/schema/oauth-identities'
import { plants } from '@lily/db/schema/plants'
import { rooms } from '@lily/db/schema/rooms'
import { userFollows, userNudges } from '@lily/db/schema/social'
import {
  subscriptionEvents,
  subscriptionUsage,
  userSubscriptions,
} from '@lily/db/schema/subscriptions'
import { relations } from 'drizzle-orm'
import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  // `name` is the @handle, picked via the username picker. Always either NULL
  // or a valid `^[a-zA-Z0-9_]{3,30}$` value.
  name: text('name').unique(),
  // Real first/last name. Populated from social-login providers on signup
  // (Apple first-time `fullName`, Google `given_name`/`family_name`). Magic-
  // link users start NULL and can fill them in via profile edit. `firstName`
  // is required when present in an update; `lastName` is fully optional.
  firstName: text('first_name'),
  lastName: text('last_name'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  emailVerified: boolean('email_verified').notNull(),
  image: text('image'),
  bio: text('bio'),
  careReminders: boolean('care_reminders').notNull().default(true),
  weeklyDigest: boolean('weekly_digest').notNull().default(true),
  achievementNotifications: boolean('achievement_notifications')
    .notNull()
    .default(true),
  tips: boolean('tips').notNull().default(true),
  productUpdates: boolean('product_updates').notNull().default(false),
  ads: boolean('ads').notNull().default(false),
  doNotDisturb: boolean('do_not_disturb').notNull().default(false),
  doNotDisturbStart: text('do_not_disturb_start').default('22:00'),
  doNotDisturbEnd: text('do_not_disturb_end').default('07:00'),
  historyViewCount: integer('history_view_count').notNull().default(0),
  role: userRoleEnum('role').notNull().default('user'),
  status: userStatusEnum('status').notNull().default('active'),
  timezone: text('timezone').default('UTC'),
  preferredNotificationTime: text('preferred_notification_time').default(
    '09:00'
  ),
  publicProfile: boolean('public_profile').notNull().default(true),
  shareGrowthData: boolean('share_growth_data').notNull().default(true),
  personalizedTips: boolean('personalized_tips').notNull().default(true),
  language: languageCodeEnum('language').notNull().default('en'),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  weatherEnabled: boolean('weather_enabled').notNull().default(false),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  temperatureUnit: temperatureUnitEnum('temperature_unit')
    .notNull()
    .default('celsius'),
})

export const usersRelations = relations(users, ({ many, one }) => ({
  plants: many(plants),
  rooms: many(rooms),
  notifications: many(notifications),
  deviceTokens: many(deviceTokens),
  refreshTokens: many(refreshTokens),
  magicLinks: many(magicLinks),
  oauthIdentities: many(oauthIdentities),
  achievements: many(userAchievements),
  subscription: one(userSubscriptions),
  subscriptionUsage: many(subscriptionUsage),
  subscriptionEvents: many(subscriptionEvents),
  following: many(userFollows, { relationName: 'follower' }),
  followers: many(userFollows, { relationName: 'following' }),
  nudgesSent: many(userNudges, { relationName: 'nudgesSent' }),
  nudgesReceived: many(userNudges, { relationName: 'nudgesReceived' }),
  delegationsAsOwner: many(careDelegations, {
    relationName: 'delegationsAsOwner',
  }),
  delegationsAsCaretaker: many(careDelegations, {
    relationName: 'delegationsAsCaretaker',
  }),
}))
