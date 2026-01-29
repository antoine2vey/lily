import { users } from '@lily/db/schema/users'
import { relations } from 'drizzle-orm'
import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

// Enums
export const subscriptionTierEnum = pgEnum('subscription_tier', [
  'free',
  'paid',
])

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active',
  'trialing',
  'canceled',
  'expired',
  'past_due',
])

export const subscriptionEventTypeEnum = pgEnum('subscription_event_type', [
  'subscription_created',
  'subscription_updated',
  'subscription_canceled',
  'trial_started',
  'trial_ended',
  'payment_succeeded',
  'payment_failed',
  'usage_limit_reached',
])

export const paymentProviderEnum = pgEnum('payment_provider', ['revenuecat'])

export const appStoreEnum = pgEnum('app_store', ['APP_STORE', 'PLAY_STORE'])

// Tier configuration (seeded static data)
export const subscriptionTiers = pgTable('subscription_tiers', {
  tier: subscriptionTierEnum('tier').primaryKey(),
  name: text('name').notNull(),
  priceMonthly: integer('price_monthly').notNull(), // cents
  maxPlants: integer('max_plants'), // null = unlimited
  maxAiChatsMonthly: integer('max_ai_chats_monthly'),
  maxCardScansMonthly: integer('max_card_scans_monthly'),
  maxPlantIdentifiesMonthly: integer('max_plant_identifies_monthly'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// User's subscription state
export const userSubscriptions = pgTable('user_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
    .unique(),
  tier: subscriptionTierEnum('tier').notNull().default('free'),
  status: subscriptionStatusEnum('status').notNull().default('active'),

  // Trial tracking
  trialStartsAt: timestamp('trial_starts_at', { withTimezone: true }),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),

  // Subscription lifecycle
  currentPeriodStart: timestamp('current_period_start', {
    withTimezone: true,
  }).notNull(),
  currentPeriodEnd: timestamp('current_period_end', {
    withTimezone: true,
  }).notNull(),
  canceledAt: timestamp('canceled_at', { withTimezone: true }),

  // RevenueCat provider fields
  externalSubscriptionId: text('external_subscription_id'),
  externalCustomerId: text('external_customer_id'),
  provider: paymentProviderEnum('provider').notNull().default('revenuecat'),
  productId: text('product_id'), // e.g. "lily_monthly", "lily_annual"
  store: appStoreEnum('store'), // APP_STORE or PLAY_STORE

  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// Monthly usage tracking
export const subscriptionUsage = pgTable(
  'subscription_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),

    aiChatsCount: integer('ai_chats_count').notNull().default(0),
    cardScansCount: integer('card_scans_count').notNull().default(0),
    plantIdentifiesCount: integer('plant_identifies_count')
      .notNull()
      .default(0),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('subscription_usage_user_period_idx').on(
      table.userId,
      table.periodStart
    ),
  ]
)

// Subscription events (audit log)
export const subscriptionEvents = pgTable('subscription_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  eventType: subscriptionEventTypeEnum('event_type').notNull(),
  metadata: text('metadata'), // JSON string
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// Relations
export const userSubscriptionsRelations = relations(
  userSubscriptions,
  ({ one }) => ({
    user: one(users, {
      fields: [userSubscriptions.userId],
      references: [users.id],
    }),
    tier: one(subscriptionTiers, {
      fields: [userSubscriptions.tier],
      references: [subscriptionTiers.tier],
    }),
  })
)

export const subscriptionUsageRelations = relations(
  subscriptionUsage,
  ({ one }) => ({
    user: one(users, {
      fields: [subscriptionUsage.userId],
      references: [users.id],
    }),
  })
)

export const subscriptionEventsRelations = relations(
  subscriptionEvents,
  ({ one }) => ({
    user: one(users, {
      fields: [subscriptionEvents.userId],
      references: [users.id],
    }),
  })
)
