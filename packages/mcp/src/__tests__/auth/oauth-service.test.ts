import {
  type AccessToken,
  type AuthorizationCode,
  type IOAuthRepository,
  type OAuthClient,
  OAuthRepository,
  type RefreshToken,
  type UserApiCredentials,
} from '@lily/mcp/auth/oauth-repository'
import { OAuthService, OAuthServiceLive } from '@lily/mcp/auth/oauth-service'
import { Array, Effect, Exit, Layer, Option, pipe } from 'effect'
import { beforeEach, describe, expect, it } from 'vitest'

// ── In-memory repository mock ─────────────────────────────────────────

const createInMemoryOAuthRepository = () => {
  const clients: OAuthClient[] = []
  let authCodes: AuthorizationCode[] = []
  let accessTokens: AccessToken[] = []
  let refreshTokens: RefreshToken[] = []
  let apiCredentials: UserApiCredentials[] = []

  const repo: IOAuthRepository = {
    getClient: (clientId) =>
      Effect.succeed(Array.findFirst(clients, (c) => c.client_id === clientId)),

    registerClient: (params) =>
      Effect.sync(() => {
        const client: OAuthClient = {
          ...params,
          client_id: params.client_id ?? crypto.randomUUID(),
          client_id_issued_at: Math.floor(Date.now() / 1000),
        }
        clients.push(client)
        return client
      }),

    saveAuthorizationCode: (code) =>
      Effect.sync(() => {
        authCodes.push(code)
      }),

    getAuthorizationCode: (code) =>
      Effect.succeed(
        Array.findFirst(authCodes, (c) => c.authorizationCode === code)
      ),

    revokeAuthorizationCode: (code) =>
      Effect.sync(() => {
        authCodes = Array.filter(authCodes, (c) => c.authorizationCode !== code)
      }),

    consumeAuthorizationCode: (code) =>
      Effect.sync(() => {
        const found = Array.findFirst(
          authCodes,
          (c) => c.authorizationCode === code
        )
        authCodes = Array.filter(authCodes, (c) => c.authorizationCode !== code)
        return found
      }),

    saveAccessToken: (token) =>
      Effect.sync(() => {
        accessTokens.push(token)
      }),

    getAccessToken: (token) =>
      Effect.succeed(Array.findFirst(accessTokens, (t) => t.token === token)),

    revokeAccessToken: (token) =>
      Effect.sync(() => {
        accessTokens = Array.filter(accessTokens, (t) => t.token !== token)
      }),

    saveRefreshToken: (token) =>
      Effect.sync(() => {
        refreshTokens.push(token)
      }),

    getRefreshToken: (token) =>
      Effect.succeed(Array.findFirst(refreshTokens, (t) => t.token === token)),

    revokeRefreshToken: (token) =>
      Effect.sync(() => {
        refreshTokens = Array.filter(refreshTokens, (t) => t.token !== token)
      }),

    consumeRefreshToken: (token) =>
      Effect.sync(() => {
        const found = pipe(
          Array.findFirst(refreshTokens, (t) => t.token === token),
          Option.match({
            onNone: () => Option.none(),
            onSome: (t) => {
              refreshTokens = Array.filter(
                refreshTokens,
                (rt) => rt.token !== token
              )
              return Option.some(t)
            },
          })
        )
        return found
      }),

    upsertUserApiCredentials: (creds) =>
      Effect.sync(() => {
        apiCredentials = pipe(
          Array.filter(apiCredentials, (c) => c.userId !== creds.userId),
          Array.append(creds)
        )
      }),

    getUserApiCredentials: (userId) =>
      Effect.succeed(
        Array.findFirst(apiCredentials, (c) => c.userId === userId)
      ),
  }

  return {
    layer: Layer.succeed(OAuthRepository, repo),
    getState: () => ({
      clients,
      authCodes,
      accessTokens,
      refreshTokens,
      apiCredentials,
    }),
  }
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('OAuthService', () => {
  let repoMock: ReturnType<typeof createInMemoryOAuthRepository>
  let serviceLayer: Layer.Layer<OAuthService>

  beforeEach(() => {
    repoMock = createInMemoryOAuthRepository()
    serviceLayer = OAuthServiceLive.pipe(Layer.provide(repoMock.layer))
  })

  // ── Client Registration ─────────────────────────────────────────────

  describe('getClient / registerClient', () => {
    it('should return None for non-existent client', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* OAuthService
          return yield* service.getClient('nonexistent')
        }).pipe(Effect.provide(serviceLayer))
      )

      expect(Option.isNone(result)).toBe(true)
    })

    it('should register and retrieve a client', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* OAuthService
          const registered = yield* service.registerClient({
            redirect_uris: ['http://localhost:3000/callback'],
            client_name: 'Test App',
          })
          const found = yield* service.getClient(registered.client_id)
          return { registered, found }
        }).pipe(Effect.provide(serviceLayer))
      )

      expect(result.registered.client_id).toBeDefined()
      expect(result.registered.client_name).toBe('Test App')
      expect(Option.isSome(result.found)).toBe(true)
    })
  })

  // ── Authorization Code ──────────────────────────────────────────────

  describe('createAuthorizationCode', () => {
    it('should create an authorization code', async () => {
      const code = await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* OAuthService
          return yield* service.createAuthorizationCode({
            clientId: 'client-1',
            userId: 'user-1',
            redirectUri: 'http://localhost:3000/callback',
            codeChallenge: 'test-challenge',
            scopes: ['plants:read'],
          })
        }).pipe(Effect.provide(serviceLayer))
      )

      expect(code).toBeDefined()
      expect(typeof code).toBe('string')
      expect(repoMock.getState().authCodes).toHaveLength(1)
    })
  })

  // ── Token Exchange ──────────────────────────────────────────────────

  describe('exchangeAuthorizationCode', () => {
    it('should fail for non-existent code', async () => {
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const service = yield* OAuthService
          return yield* service.exchangeAuthorizationCode({
            code: 'bad-code',
            clientId: 'client-1',
            codeVerifier: 'verifier',
          })
        }).pipe(Effect.provide(serviceLayer))
      )

      expect(Exit.isFailure(exit)).toBe(true)
    })

    it('should fail for expired authorization code', async () => {
      const expiredCode: AuthorizationCode = {
        authorizationCode: 'expired-code',
        clientId: 'client-1',
        userId: 'user-1',
        redirectUri: 'http://localhost:3000/callback',
        codeChallenge: 'challenge',
        scopes: ['plants:read'],
        expiresAt: new Date('2020-01-01'),
      }
      repoMock.getState().authCodes.push(expiredCode)

      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const service = yield* OAuthService
          return yield* service.exchangeAuthorizationCode({
            code: 'expired-code',
            clientId: 'client-1',
            codeVerifier: 'verifier',
          })
        }).pipe(Effect.provide(serviceLayer))
      )

      expect(Exit.isFailure(exit)).toBe(true)
    })

    it('should fail for client mismatch', async () => {
      const futureDate = new Date()
      futureDate.setHours(futureDate.getHours() + 1)

      const authCode: AuthorizationCode = {
        authorizationCode: 'valid-code',
        clientId: 'client-1',
        userId: 'user-1',
        redirectUri: 'http://localhost:3000/callback',
        codeChallenge: 'challenge',
        scopes: ['plants:read'],
        expiresAt: futureDate,
      }
      repoMock.getState().authCodes.push(authCode)

      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const service = yield* OAuthService
          return yield* service.exchangeAuthorizationCode({
            code: 'valid-code',
            clientId: 'wrong-client',
            codeVerifier: 'verifier',
          })
        }).pipe(Effect.provide(serviceLayer))
      )

      expect(Exit.isFailure(exit)).toBe(true)
    })

    it('should consume the auth code (single use)', async () => {
      const futureDate = new Date()
      futureDate.setHours(futureDate.getHours() + 1)

      // Generate proper PKCE challenge
      const verifier = 'test-verifier-string-that-is-long-enough-for-pkce'
      const encoder = new TextEncoder()
      const digest = await crypto.subtle.digest(
        'SHA-256',
        encoder.encode(verifier)
      )
      const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')

      const authCode: AuthorizationCode = {
        authorizationCode: 'single-use-code',
        clientId: 'client-1',
        userId: 'user-1',
        redirectUri: 'http://localhost:3000/callback',
        codeChallenge: challenge,
        scopes: ['plants:read'],
        expiresAt: futureDate,
      }
      repoMock.getState().authCodes.push(authCode)

      // First exchange should succeed
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* OAuthService
          return yield* service.exchangeAuthorizationCode({
            code: 'single-use-code',
            clientId: 'client-1',
            codeVerifier: verifier,
          })
        }).pipe(Effect.provide(serviceLayer))
      )

      expect(result.access_token).toBeDefined()
      expect(result.refresh_token).toBeDefined()
      expect(result.token_type).toBe('Bearer')
      expect(result.expires_in).toBeGreaterThan(0)

      // Second exchange should fail (code consumed)
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const service = yield* OAuthService
          return yield* service.exchangeAuthorizationCode({
            code: 'single-use-code',
            clientId: 'client-1',
            codeVerifier: verifier,
          })
        }).pipe(Effect.provide(serviceLayer))
      )

      expect(Exit.isFailure(exit)).toBe(true)
    })
  })

  // ── Validate Bearer Token ───────────────────────────────────────────

  describe('validateBearerToken', () => {
    it('should fail for non-existent token', async () => {
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const service = yield* OAuthService
          return yield* service.validateBearerToken('bad-token')
        }).pipe(Effect.provide(serviceLayer))
      )

      expect(Exit.isFailure(exit)).toBe(true)
    })

    it('should fail for expired access token', async () => {
      const expiredToken: AccessToken = {
        token: 'expired-access',
        clientId: 'client-1',
        userId: 'user-1',
        scopes: ['plants:read'],
        expiresAt: new Date('2020-01-01'),
      }
      repoMock.getState().accessTokens.push(expiredToken)

      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const service = yield* OAuthService
          return yield* service.validateBearerToken('expired-access')
        }).pipe(Effect.provide(serviceLayer))
      )

      expect(Exit.isFailure(exit)).toBe(true)
    })

    it('should return userId and scopes for valid token', async () => {
      const futureDate = new Date()
      futureDate.setHours(futureDate.getHours() + 1)

      const validToken: AccessToken = {
        token: 'valid-access',
        clientId: 'client-1',
        userId: 'user-1',
        scopes: ['plants:read', 'plants:write'],
        expiresAt: futureDate,
      }
      repoMock.getState().accessTokens.push(validToken)

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* OAuthService
          return yield* service.validateBearerToken('valid-access')
        }).pipe(Effect.provide(serviceLayer))
      )

      expect(result.userId).toBe('user-1')
      expect(result.scopes).toEqual(['plants:read', 'plants:write'])
    })

    it('should revoke expired token on validation', async () => {
      const expiredToken: AccessToken = {
        token: 'expired-to-revoke',
        clientId: 'client-1',
        userId: 'user-1',
        scopes: ['plants:read'],
        expiresAt: new Date('2020-01-01'),
      }
      repoMock.getState().accessTokens.push(expiredToken)

      await Effect.runPromiseExit(
        Effect.gen(function* () {
          const service = yield* OAuthService
          return yield* service.validateBearerToken('expired-to-revoke')
        }).pipe(Effect.provide(serviceLayer))
      )

      // Token should have been revoked
      expect(
        Array.findFirst(
          repoMock.getState().accessTokens,
          (t) => t.token === 'expired-to-revoke'
        )
      ).toEqual(Option.none())
    })
  })

  // ── Refresh Token ───────────────────────────────────────────────────

  describe('refreshAccessToken', () => {
    it('should fail for non-existent refresh token', async () => {
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const service = yield* OAuthService
          return yield* service.refreshAccessToken({
            refreshToken: 'bad-refresh',
            clientId: 'client-1',
          })
        }).pipe(Effect.provide(serviceLayer))
      )

      expect(Exit.isFailure(exit)).toBe(true)
    })

    it('should fail for expired refresh token', async () => {
      const expiredRefresh: RefreshToken = {
        token: 'expired-refresh',
        clientId: 'client-1',
        userId: 'user-1',
        scopes: ['plants:read'],
        expiresAt: new Date('2020-01-01'),
      }
      repoMock.getState().refreshTokens.push(expiredRefresh)

      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const service = yield* OAuthService
          return yield* service.refreshAccessToken({
            refreshToken: 'expired-refresh',
            clientId: 'client-1',
          })
        }).pipe(Effect.provide(serviceLayer))
      )

      expect(Exit.isFailure(exit)).toBe(true)
    })

    it('should fail for client mismatch', async () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 30)

      const refreshToken: RefreshToken = {
        token: 'valid-refresh',
        clientId: 'client-1',
        userId: 'user-1',
        scopes: ['plants:read'],
        expiresAt: futureDate,
      }
      repoMock.getState().refreshTokens.push(refreshToken)

      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const service = yield* OAuthService
          return yield* service.refreshAccessToken({
            refreshToken: 'valid-refresh',
            clientId: 'wrong-client',
          })
        }).pipe(Effect.provide(serviceLayer))
      )

      expect(Exit.isFailure(exit)).toBe(true)
    })

    it('should issue new tokens and revoke old refresh token', async () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 30)

      const refreshToken: RefreshToken = {
        token: 'old-refresh',
        clientId: 'client-1',
        userId: 'user-1',
        scopes: ['plants:read', 'plants:write'],
        expiresAt: futureDate,
      }
      repoMock.getState().refreshTokens.push(refreshToken)

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* OAuthService
          return yield* service.refreshAccessToken({
            refreshToken: 'old-refresh',
            clientId: 'client-1',
          })
        }).pipe(Effect.provide(serviceLayer))
      )

      expect(result.access_token).toBeDefined()
      expect(result.refresh_token).toBeDefined()
      expect(result.token_type).toBe('Bearer')
      expect(result.scope).toBe('plants:read plants:write')

      // Old refresh token should be revoked
      expect(
        Array.findFirst(
          repoMock.getState().refreshTokens,
          (t) => t.token === 'old-refresh'
        )
      ).toEqual(Option.none())

      // New tokens should exist
      expect(repoMock.getState().accessTokens).toHaveLength(1)
      expect(repoMock.getState().refreshTokens).toHaveLength(1)
    })
  })

  // ── Token Revocation ────────────────────────────────────────────────

  describe('revokeToken', () => {
    it('should revoke access token with hint', async () => {
      const futureDate = new Date()
      futureDate.setHours(futureDate.getHours() + 1)

      repoMock.getState().accessTokens.push({
        token: 'revoke-me',
        clientId: 'client-1',
        userId: 'user-1',
        scopes: ['plants:read'],
        expiresAt: futureDate,
      })

      await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* OAuthService
          yield* service.revokeToken({
            token: 'revoke-me',
            token_type_hint: 'access_token',
          })
        }).pipe(Effect.provide(serviceLayer))
      )

      expect(repoMock.getState().accessTokens).toHaveLength(0)
    })

    it('should revoke refresh token with hint', async () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 30)

      repoMock.getState().refreshTokens.push({
        token: 'revoke-refresh',
        clientId: 'client-1',
        userId: 'user-1',
        scopes: ['plants:read'],
        expiresAt: futureDate,
      })

      await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* OAuthService
          yield* service.revokeToken({
            token: 'revoke-refresh',
            token_type_hint: 'refresh_token',
          })
        }).pipe(Effect.provide(serviceLayer))
      )

      expect(repoMock.getState().refreshTokens).toHaveLength(0)
    })

    it('should try both token types without hint', async () => {
      const futureDate = new Date()
      futureDate.setHours(futureDate.getHours() + 1)

      repoMock.getState().accessTokens.push({
        token: 'unknown-type',
        clientId: 'client-1',
        userId: 'user-1',
        scopes: ['plants:read'],
        expiresAt: futureDate,
      })

      await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* OAuthService
          yield* service.revokeToken({ token: 'unknown-type' })
        }).pipe(Effect.provide(serviceLayer))
      )

      expect(repoMock.getState().accessTokens).toHaveLength(0)
    })

    it('should succeed silently for non-existent token (RFC 7009)', async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* OAuthService
          yield* service.revokeToken({ token: 'doesnt-exist' })
        }).pipe(Effect.provide(serviceLayer))
      )

      // Should not throw
    })
  })
})
