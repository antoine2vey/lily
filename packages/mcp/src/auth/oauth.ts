import type * as PgDrizzle from '@effect/sql-drizzle/Pg'
import {
  oauthAccessTokens,
  oauthAuthorizationCodes,
  oauthClients,
  oauthRefreshTokens,
} from '@lily/db/schema'
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
} from '@modelcontextprotocol/sdk/shared/auth.js'
import { eq } from 'drizzle-orm'
import { Array, Effect, Option, pipe } from 'effect'
import type {
  AccessToken,
  AuthorizationCode,
  OAuthServerModel,
  RefreshToken,
} from 'mcp-oauth-server'

/**
 * Database-backed OAuth model for the MCP OAuth server.
 *
 * Implements the OAuthServerModel interface from mcp-oauth-server,
 * storing all OAuth state (clients, tokens, codes) in PostgreSQL via Drizzle.
 *
 * This is constructed with a live PgDrizzle instance (extracted from the
 * Effect runtime) so the methods can be plain async functions as the
 * library expects.
 */
export class LilyOAuthServerModel implements OAuthServerModel {
  constructor(private readonly db: PgDrizzle.PgDrizzle['Type']) {}

  // ── Client Registration ──────────────────────────────────────────────

  async getClient(
    clientId: string
  ): Promise<OAuthClientInformationFull | undefined> {
    const rows = await Effect.runPromise(
      this.db
        .select()
        .from(oauthClients)
        .where(eq(oauthClients.clientId, clientId))
    )

    return pipe(
      Array.head(rows),
      Option.map((row) => this.rowToClient(row)),
      Option.getOrUndefined
    )
  }

  async registerClient(
    client: Omit<
      OAuthClientInformationFull,
      'client_id' | 'client_id_issued_at'
    > & {
      client_id?: string
      client_id_issued_at?: number
    }
  ): Promise<OAuthClientInformationFull> {
    const clientId = client.client_id ?? crypto.randomUUID()
    const clientIdIssuedAt = client.client_id_issued_at
      ? new Date(client.client_id_issued_at * 1000)
      : new Date()

    await Effect.runPromise(
      this.db.insert(oauthClients).values({
        clientId,
        clientSecret: client.client_secret ?? null,
        clientSecretExpiresAt: client.client_secret_expires_at
          ? new Date(client.client_secret_expires_at * 1000)
          : null,
        redirectUris: client.redirect_uris,
        clientName: client.client_name ?? null,
        clientUri: client.client_uri ?? null,
        logoUri: client.logo_uri ?? null,
        scope: client.scope ?? null,
        grantTypes: client.grant_types ?? null,
        responseTypes: client.response_types ?? null,
        tokenEndpointAuthMethod: client.token_endpoint_auth_method ?? null,
        clientIdIssuedAt,
      })
    )

    return {
      ...client,
      client_id: clientId,
      client_id_issued_at: Math.floor(clientIdIssuedAt.getTime() / 1000),
    } as OAuthClientInformationFull
  }

  // ── Authorization Codes ──────────────────────────────────────────────

  async saveAuthorizationCode(
    code: AuthorizationCode,
    _client: OAuthClientInformationFull
  ): Promise<void> {
    await Effect.runPromise(
      this.db.insert(oauthAuthorizationCodes).values({
        authorizationCode: code.authorizationCode,
        clientId: code.clientId,
        userId: code.userId,
        redirectUri: code.redirectUri,
        codeChallenge: code.codeChallenge,
        scopes: code.scopes ?? [],
        state: code.state ?? null,
        resource: code.resource ?? null,
        expiresAt: code.expiresAt,
      })
    )
  }

  async getAuthorizationCode(
    authorizationCode: string
  ): Promise<AuthorizationCode | undefined> {
    const rows = await Effect.runPromise(
      this.db
        .select()
        .from(oauthAuthorizationCodes)
        .where(eq(oauthAuthorizationCodes.authorizationCode, authorizationCode))
    )

    return pipe(
      Array.head(rows),
      Option.map(
        (row): AuthorizationCode => ({
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
      ),
      Option.getOrUndefined
    )
  }

  async revokeAuthorizationCode(authorizationCode: string): Promise<void> {
    await Effect.runPromise(
      this.db
        .delete(oauthAuthorizationCodes)
        .where(eq(oauthAuthorizationCodes.authorizationCode, authorizationCode))
    )
  }

  // ── Access Tokens ────────────────────────────────────────────────────

  async saveAccessToken(
    token: AccessToken,
    _client: OAuthClientInformationFull
  ): Promise<void> {
    await Effect.runPromise(
      this.db.insert(oauthAccessTokens).values({
        token: token.token,
        clientId: token.clientId,
        userId: token.userId,
        scopes: token.scopes,
        resource: token.resource ?? null,
        expiresAt: token.expiresAt,
      })
    )
  }

  async getAccessToken(accessToken: string): Promise<AccessToken | undefined> {
    const rows = await Effect.runPromise(
      this.db
        .select()
        .from(oauthAccessTokens)
        .where(eq(oauthAccessTokens.token, accessToken))
    )

    return pipe(
      Array.head(rows),
      Option.map(
        (row): AccessToken => ({
          token: row.token,
          clientId: row.clientId,
          userId: row.userId,
          scopes: row.scopes,
          expiresAt: row.expiresAt,
          ...(row.resource != null ? { resource: row.resource } : {}),
        })
      ),
      Option.getOrUndefined
    )
  }

  async revokeAccessToken(accessToken: string): Promise<void> {
    await Effect.runPromise(
      this.db
        .delete(oauthAccessTokens)
        .where(eq(oauthAccessTokens.token, accessToken))
    )
  }

  // ── Refresh Tokens ───────────────────────────────────────────────────

  async saveRefreshToken(
    token: RefreshToken,
    _client: OAuthClientInformationFull
  ): Promise<void> {
    await Effect.runPromise(
      this.db.insert(oauthRefreshTokens).values({
        token: token.token,
        clientId: token.clientId,
        userId: token.userId,
        scopes: token.scopes,
        resource: token.resource ?? null,
        expiresAt: token.expiresAt,
      })
    )
  }

  async getRefreshToken(
    refreshToken: string
  ): Promise<AccessToken | undefined> {
    const rows = await Effect.runPromise(
      this.db
        .select()
        .from(oauthRefreshTokens)
        .where(eq(oauthRefreshTokens.token, refreshToken))
    )

    return pipe(
      Array.head(rows),
      Option.map(
        (row): AccessToken => ({
          token: row.token,
          clientId: row.clientId,
          userId: row.userId,
          scopes: row.scopes,
          expiresAt: row.expiresAt,
          ...(row.resource != null ? { resource: row.resource } : {}),
        })
      ),
      Option.getOrUndefined
    )
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    await Effect.runPromise(
      this.db
        .delete(oauthRefreshTokens)
        .where(eq(oauthRefreshTokens.token, refreshToken))
    )
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private rowToClient(
    row: typeof oauthClients.$inferSelect
  ): OAuthClientInformationFull {
    return {
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
    } as OAuthClientInformationFull
  }
}
