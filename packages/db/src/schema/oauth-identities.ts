import { users } from '@lily/db/schema/users'
import { relations } from 'drizzle-orm'
import {
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * OAuth identities — links external provider accounts (Apple, Google, ...) to
 * a single `users` row. Multiple identities can point at the same user,
 * supporting account-linking and email-based merging.
 */
export const oauthIdentities = pgTable(
  'oauth_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerUserId: text('provider_user_id').notNull(),
    providerEmail: text('provider_email'),
    providerName: text('provider_name'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    providerUserIdUnique: unique('oauth_identities_provider_user_id_unique').on(
      table.provider,
      table.providerUserId
    ),
    userIdIdx: index('oauth_identities_user_id_idx').on(table.userId),
  })
)

export const oauthIdentitiesRelations = relations(
  oauthIdentities,
  ({ one }) => ({
    user: one(users, {
      fields: [oauthIdentities.userId],
      references: [users.id],
    }),
  })
)
