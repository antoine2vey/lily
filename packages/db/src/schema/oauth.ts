import { users } from '@lily/db/schema/users'
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * OAuth client registrations — dynamic client registration per MCP spec.
 * Each MCP client (Claude Desktop, Claude Code, etc.) gets a unique registration.
 */
export const oauthClients = pgTable('oauth_clients', {
  clientId: text('client_id').primaryKey(),
  clientSecret: text('client_secret'),
  clientSecretExpiresAt: timestamp('client_secret_expires_at', {
    withTimezone: true,
  }),
  redirectUris: text('redirect_uris').array().notNull(),
  clientName: text('client_name'),
  clientUri: text('client_uri'),
  logoUri: text('logo_uri'),
  scope: text('scope'),
  grantTypes: text('grant_types').array(),
  responseTypes: text('response_types').array(),
  tokenEndpointAuthMethod: text('token_endpoint_auth_method'),
  clientIdIssuedAt: timestamp('client_id_issued_at', {
    withTimezone: true,
  }).defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

/**
 * OAuth access tokens — short-lived tokens for MCP requests.
 * apiJwt/apiRefreshToken store the API server JWT obtained during auth,
 * enabling the MCP server to make authenticated API calls on behalf of the user.
 */
export const oauthAccessTokens = pgTable('oauth_access_tokens', {
  token: text('token').primaryKey(),
  clientId: text('client_id')
    .notNull()
    .references(() => oauthClients.clientId, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  scopes: text('scopes').array().notNull(),
  resource: text('resource'),
  apiJwt: text('api_jwt'),
  apiRefreshToken: text('api_refresh_token'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

/**
 * OAuth refresh tokens — long-lived tokens for automatic token renewal.
 */
export const oauthRefreshTokens = pgTable('oauth_refresh_tokens', {
  token: text('token').primaryKey(),
  clientId: text('client_id')
    .notNull()
    .references(() => oauthClients.clientId, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  scopes: text('scopes').array().notNull(),
  resource: text('resource'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

/**
 * OAuth authorization codes — short-lived codes exchanged for tokens.
 * These are consumed once during the code exchange flow.
 */
export const oauthAuthorizationCodes = pgTable('oauth_authorization_codes', {
  authorizationCode: text('authorization_code').primaryKey(),
  clientId: text('client_id')
    .notNull()
    .references(() => oauthClients.clientId, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  redirectUri: text('redirect_uri').notNull(),
  codeChallenge: text('code_challenge').notNull(),
  scopes: text('scopes').array().notNull(),
  state: text('state'),
  resource: text('resource'),
  apiJwt: text('api_jwt'),
  apiRefreshToken: text('api_refresh_token'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})
