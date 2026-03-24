import { users } from '@lily/db/schema/users'
import { relations } from 'drizzle-orm'
import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const giftCodeDurationEnum = pgEnum('gift_code_duration', [
  '7d',
  '1m',
  '1y',
  'infinite',
])

export const giftCodes = pgTable('gift_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  duration: giftCodeDurationEnum('duration').notNull(),
  maxUsages: integer('max_usages').notNull(),
  currentUsages: integer('current_usages').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const giftCodeRedemptions = pgTable(
  'gift_code_redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    giftCodeId: uuid('gift_code_id')
      .notNull()
      .references(() => giftCodes.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    redeemedAt: timestamp('redeemed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('gift_code_redemptions_code_user_idx').on(
      table.giftCodeId,
      table.userId
    ),
  ]
)

export const giftCodesRelations = relations(giftCodes, ({ many }) => ({
  redemptions: many(giftCodeRedemptions),
}))

export const giftCodeRedemptionsRelations = relations(
  giftCodeRedemptions,
  ({ one }) => ({
    giftCode: one(giftCodes, {
      fields: [giftCodeRedemptions.giftCodeId],
      references: [giftCodes.id],
    }),
    user: one(users, {
      fields: [giftCodeRedemptions.userId],
      references: [users.id],
    }),
  })
)
