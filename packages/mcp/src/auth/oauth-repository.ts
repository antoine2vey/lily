import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import {
  oauthAccessTokens,
  oauthAuthorizationCodes,
  oauthClients,
  oauthRefreshTokens,
  oauthUserApiCredentials,
} from '@lily/db/schema'
import { eq } from 'drizzle-orm'
import { Array, Context, DateTime, Effect, Layer, Option, pipe } from 'effect'

// ── Types ──────────────────────────────────────────────────────────────

export interface OAuthClient {
  readonly client_id: string
  readonly client_secret?: string | undefined
  readonly client_secret_expires_at?: number | undefined
  readonly redirect_uris: readonly string[]
  readonly client_name?: string | undefined
  readonly client_uri?: string | undefined
  readonly logo_uri?: string | undefined
  readonly scope?: string | undefined
  readonly grant_types?: readonly string[] | undefined
  readonly response_types?: readonly string[] | undefined
  readonly token_endpoint_auth_method?: string | undefined
  readonly client_id_issued_at?: number | undefined
}

export interface AuthorizationCode {
  readonly authorizationCode: string
  readonly clientId: string
  readonly userId: string
  readonly redirectUri: string
  readonly codeChallenge: string
  readonly scopes: readonly string[]
  readonly expiresAt: Date
  readonly state?: string | undefined
  readonly resource?: string | undefined
}

export interface AccessToken {
  readonly token: string
  readonly clientId: string
  readonly userId: string
  readonly scopes: readonly string[]
  readonly expiresAt: Date
  readonly resource?: string | undefined
}

export interface RefreshToken {
  readonly token: string
  readonly clientId: string
  readonly userId: string
  readonly scopes: readonly string[]
  readonly expiresAt: Date
  readonly resource?: string | undefined
}

export interface UserApiCredentials {
  readonly userId: string
  readonly apiJwt: string
  readonly apiRefreshToken: string
}

// ── Interface ──────────────────────────────────────────────────────────

export interface IOAuthRepository {
  readonly getClient: (
    clientId: string
  ) => Effect.Effect<Option.Option<OAuthClient>, SqlError>
  readonly registerClient: (
    client: Omit<OAuthClient, 'client_id' | 'client_id_issued_at'> & {
      readonly client_id?: string | undefined
      readonly client_id_issued_at?: number | undefined
    }
  ) => Effect.Effect<OAuthClient, SqlError>
  readonly saveAuthorizationCode: (
    code: AuthorizationCode
  ) => Effect.Effect<void, SqlError>
  readonly getAuthorizationCode: (
    code: string
  ) => Effect.Effect<Option.Option<AuthorizationCode>, SqlError>
  readonly revokeAuthorizationCode: (
    code: string
  ) => Effect.Effect<void, SqlError>
  /** Atomically consume (delete + return) an authorization code. */
  readonly consumeAuthorizationCode: (
    code: string
  ) => Effect.Effect<Option.Option<AuthorizationCode>, SqlError>
  readonly saveAccessToken: (
    token: AccessToken
  ) => Effect.Effect<void, SqlError>
  readonly getAccessToken: (
    token: string
  ) => Effect.Effect<Option.Option<AccessToken>, SqlError>
  readonly revokeAccessToken: (token: string) => Effect.Effect<void, SqlError>
  readonly saveRefreshToken: (
    token: RefreshToken
  ) => Effect.Effect<void, SqlError>
  readonly getRefreshToken: (
    token: string
  ) => Effect.Effect<Option.Option<RefreshToken>, SqlError>
  readonly revokeRefreshToken: (token: string) => Effect.Effect<void, SqlError>
  /** Atomically consume (delete + return) a refresh token. */
  readonly consumeRefreshToken: (
    token: string
  ) => Effect.Effect<Option.Option<RefreshToken>, SqlError>
  /** Upsert API credentials for a user. */
  readonly upsertUserApiCredentials: (
    creds: UserApiCredentials
  ) => Effect.Effect<void, SqlError>
  /** Get API credentials for a user. */
  readonly getUserApiCredentials: (
    userId: string
  ) => Effect.Effect<Option.Option<UserApiCredentials>, SqlError>
}

// ── Context Tag ────────────────────────────────────────────────────────

export class OAuthRepository extends Context.Tag('OAuthRepository')<
  OAuthRepository,
  IOAuthRepository
>() {}

// ── Helpers ────────────────────────────────────────────────────────────

const rowToClient = (row: typeof oauthClients.$inferSelect): OAuthClient => ({
  client_id: row.clientId,
  client_secret: row.clientSecret ?? undefined,
  client_secret_expires_at: row.clientSecretExpiresAt
    ? Math.floor(row.clientSecretExpiresAt.getTime() / 1000)
    : undefined,
  redirect_uris: row.redirectUris,
  client_name: row.clientName ?? undefined,
  client_uri: row.clientUri ?? undefined,
  logo_uri: row.logoUri ?? undefined,
  scope: row.scope ?? undefined,
  grant_types: row.grantTypes ?? undefined,
  response_types: row.responseTypes ?? undefined,
  token_endpoint_auth_method: row.tokenEndpointAuthMethod ?? undefined,
  client_id_issued_at: row.clientIdIssuedAt
    ? Math.floor(row.clientIdIssuedAt.getTime() / 1000)
    : undefined,
})

const rowToAuthCode = (
  row: typeof oauthAuthorizationCodes.$inferSelect
): AuthorizationCode => ({
  authorizationCode: row.authorizationCode,
  clientId: row.clientId,
  userId: row.userId,
  redirectUri: row.redirectUri,
  codeChallenge: row.codeChallenge,
  scopes: row.scopes ?? [],
  expiresAt: row.expiresAt,
  ...(row.state != null ? { state: row.state } : {}),
  ...(row.resource != null ? { resource: row.resource } : {}),
})

const rowToAccessToken = (
  row: typeof oauthAccessTokens.$inferSelect
): AccessToken => ({
  token: row.token,
  clientId: row.clientId,
  userId: row.userId,
  scopes: row.scopes,
  expiresAt: row.expiresAt,
  ...(row.resource != null ? { resource: row.resource } : {}),
})

const rowToRefreshToken = (
  row: typeof oauthRefreshTokens.$inferSelect
): RefreshToken => ({
  token: row.token,
  clientId: row.clientId,
  userId: row.userId,
  scopes: row.scopes,
  expiresAt: row.expiresAt,
  ...(row.resource != null ? { resource: row.resource } : {}),
})

// ── Live Layer ─────────────────────────────────────────────────────────

export const OAuthRepositoryLive = Layer.effect(
  OAuthRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      // ── Clients ──────────────────────────────────────────────────

      getClient: (clientId) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select()
            .from(oauthClients)
            .where(eq(oauthClients.clientId, clientId))
          return pipe(Array.head(rows), Option.map(rowToClient))
        }).pipe(Effect.withSpan('OAuthRepository.getClient')),

      registerClient: (client) =>
        Effect.gen(function* () {
          const clientId = client.client_id ?? crypto.randomUUID()
          const clientIdIssuedAt = client.client_id_issued_at
            ? new Date(client.client_id_issued_at * 1000)
            : DateTime.toDateUtc(DateTime.unsafeNow())

          yield* db.insert(oauthClients).values({
            clientId,
            clientSecret: client.client_secret ?? null,
            clientSecretExpiresAt: client.client_secret_expires_at
              ? new Date(client.client_secret_expires_at * 1000)
              : null,
            redirectUris: client.redirect_uris as string[],
            clientName: client.client_name ?? null,
            clientUri: client.client_uri ?? null,
            logoUri: client.logo_uri ?? null,
            scope: client.scope ?? null,
            grantTypes: (client.grant_types as string[]) ?? null,
            responseTypes: (client.response_types as string[]) ?? null,
            tokenEndpointAuthMethod: client.token_endpoint_auth_method ?? null,
            clientIdIssuedAt,
          })

          return {
            ...client,
            client_id: clientId,
            client_id_issued_at: Math.floor(clientIdIssuedAt.getTime() / 1000),
          } as OAuthClient
        }).pipe(Effect.withSpan('OAuthRepository.registerClient')),

      // ── Authorization Codes ──────────────────────────────────────

      saveAuthorizationCode: (code) =>
        Effect.gen(function* () {
          yield* db.insert(oauthAuthorizationCodes).values({
            authorizationCode: code.authorizationCode,
            clientId: code.clientId,
            userId: code.userId,
            redirectUri: code.redirectUri,
            codeChallenge: code.codeChallenge,
            scopes: code.scopes as string[],
            state: code.state ?? null,
            resource: code.resource ?? null,
            expiresAt: code.expiresAt,
          })
        }).pipe(Effect.withSpan('OAuthRepository.saveAuthorizationCode')),

      getAuthorizationCode: (code) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select()
            .from(oauthAuthorizationCodes)
            .where(eq(oauthAuthorizationCodes.authorizationCode, code))
          return pipe(Array.head(rows), Option.map(rowToAuthCode))
        }).pipe(Effect.withSpan('OAuthRepository.getAuthorizationCode')),

      revokeAuthorizationCode: (code) =>
        Effect.gen(function* () {
          yield* db
            .delete(oauthAuthorizationCodes)
            .where(eq(oauthAuthorizationCodes.authorizationCode, code))
        }).pipe(Effect.withSpan('OAuthRepository.revokeAuthorizationCode')),

      consumeAuthorizationCode: (code) =>
        Effect.gen(function* () {
          const rows = yield* db
            .delete(oauthAuthorizationCodes)
            .where(eq(oauthAuthorizationCodes.authorizationCode, code))
            .returning()
          return pipe(Array.head(rows), Option.map(rowToAuthCode))
        }).pipe(Effect.withSpan('OAuthRepository.consumeAuthorizationCode')),

      // ── Access Tokens ────────────────────────────────────────────

      saveAccessToken: (token) =>
        Effect.gen(function* () {
          yield* db.insert(oauthAccessTokens).values({
            token: token.token,
            clientId: token.clientId,
            userId: token.userId,
            scopes: token.scopes as string[],
            resource: token.resource ?? null,
            expiresAt: token.expiresAt,
          })
        }).pipe(Effect.withSpan('OAuthRepository.saveAccessToken')),

      getAccessToken: (accessToken) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select()
            .from(oauthAccessTokens)
            .where(eq(oauthAccessTokens.token, accessToken))
          return pipe(Array.head(rows), Option.map(rowToAccessToken))
        }).pipe(Effect.withSpan('OAuthRepository.getAccessToken')),

      revokeAccessToken: (accessToken) =>
        Effect.gen(function* () {
          yield* db
            .delete(oauthAccessTokens)
            .where(eq(oauthAccessTokens.token, accessToken))
        }).pipe(Effect.withSpan('OAuthRepository.revokeAccessToken')),

      // ── Refresh Tokens ───────────────────────────────────────────

      saveRefreshToken: (token) =>
        Effect.gen(function* () {
          yield* db.insert(oauthRefreshTokens).values({
            token: token.token,
            clientId: token.clientId,
            userId: token.userId,
            scopes: token.scopes as string[],
            resource: token.resource ?? null,
            expiresAt: token.expiresAt,
          })
        }).pipe(Effect.withSpan('OAuthRepository.saveRefreshToken')),

      getRefreshToken: (refreshToken) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select()
            .from(oauthRefreshTokens)
            .where(eq(oauthRefreshTokens.token, refreshToken))
          return pipe(Array.head(rows), Option.map(rowToRefreshToken))
        }).pipe(Effect.withSpan('OAuthRepository.getRefreshToken')),

      revokeRefreshToken: (refreshToken) =>
        Effect.gen(function* () {
          yield* db
            .delete(oauthRefreshTokens)
            .where(eq(oauthRefreshTokens.token, refreshToken))
        }).pipe(Effect.withSpan('OAuthRepository.revokeRefreshToken')),

      consumeRefreshToken: (refreshToken) =>
        Effect.gen(function* () {
          const rows = yield* db
            .delete(oauthRefreshTokens)
            .where(eq(oauthRefreshTokens.token, refreshToken))
            .returning()
          return pipe(Array.head(rows), Option.map(rowToRefreshToken))
        }).pipe(Effect.withSpan('OAuthRepository.consumeRefreshToken')),

      // ── User API Credentials ─────────────────────────────────────

      upsertUserApiCredentials: (creds) =>
        Effect.gen(function* () {
          const now = DateTime.toDateUtc(DateTime.unsafeNow())
          yield* db
            .insert(oauthUserApiCredentials)
            .values({
              userId: creds.userId,
              apiJwt: creds.apiJwt,
              apiRefreshToken: creds.apiRefreshToken,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: oauthUserApiCredentials.userId,
              set: {
                apiJwt: creds.apiJwt,
                apiRefreshToken: creds.apiRefreshToken,
                updatedAt: now,
              },
            })
        }).pipe(Effect.withSpan('OAuthRepository.upsertUserApiCredentials')),

      getUserApiCredentials: (userId) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select()
            .from(oauthUserApiCredentials)
            .where(eq(oauthUserApiCredentials.userId, userId))
          return pipe(
            Array.head(rows),
            Option.map((row) => ({
              userId: row.userId,
              apiJwt: row.apiJwt,
              apiRefreshToken: row.apiRefreshToken,
            }))
          )
        }).pipe(Effect.withSpan('OAuthRepository.getUserApiCredentials')),
    }
  })
)
