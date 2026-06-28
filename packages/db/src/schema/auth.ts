import { users } from '@lily/db/schema/users'
import { relations } from 'drizzle-orm'
import {
  type AnyPgColumn,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * Magic links - stores one-time tokens for email verification
 * Tokens expire after 10 minutes and are marked as used after verification
 */
export const magicLinks = pgTable('magic_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const magicLinksRelations = relations(magicLinks, ({ one }) => ({
  user: one(users, { fields: [magicLinks.email], references: [users.email] }),
}))

/**
 * Refresh tokens - for token refresh without re-authentication
 * NOTE: 'tokenHash' stores SHA-256 hash of token, never the plaintext
 *
 * Tokens are rotated on every refresh: the presented token is revoked and a new
 * one issued. `replacedBy` links a revoked token to its successor, forming a
 * rotation chain. This enables:
 *  - lost-response recovery: if a rotation response never reached the client,
 *    presenting the revoked token whose successor is still unused re-issues a
 *    fresh token instead of forcing a logout.
 *  - reuse detection: presenting a revoked token whose chain has already moved
 *    on signals theft, and the whole family is revoked.
 */
export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  replacedBy: uuid('replaced_by').references(
    (): AnyPgColumn => refreshTokens.id,
    { onDelete: 'set null' }
  ),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}))

/**
 * Rate limits - simple rate limiting by key
 * Key format: "magic-link:{email}" or "verify:{token}"
 */
export const rateLimits = pgTable('rate_limits', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull().default(0),
  windowStart: timestamp('window_start', { withTimezone: true })
    .notNull()
    .defaultNow(),
})
