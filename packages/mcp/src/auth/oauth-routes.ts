import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from '@effect/platform'
import { OAuthService } from '@lily/mcp/auth/oauth-service'
import { refreshApiJwtIfNeeded } from '@lily/mcp/auth/resolve-user'
import { MCP_SERVER_URL } from '@lily/mcp/config'
import { Array, Effect, Option, Schema } from 'effect'

const SCOPES_SUPPORTED = ['plants:read', 'plants:write', 'knowledge:read']

// ── Validation Schema ─────────────────────────────────────────────────

const ClientRegistrationBody = Schema.Struct({
  redirect_uris: Schema.NonEmptyArray(Schema.String),
  client_name: Schema.optionalWith(Schema.String, { exact: true }),
  client_uri: Schema.optionalWith(Schema.String, { exact: true }),
  logo_uri: Schema.optionalWith(Schema.String, { exact: true }),
  scope: Schema.optionalWith(Schema.String, { exact: true }),
  grant_types: Schema.optionalWith(Schema.Array(Schema.String), {
    exact: true,
  }),
  response_types: Schema.optionalWith(Schema.Array(Schema.String), {
    exact: true,
  }),
  token_endpoint_auth_method: Schema.optionalWith(Schema.String, {
    exact: true,
  }),
})

// ── Helpers ────────────────────────────────────────────────────────────

const jsonResponse = (body: unknown, status = 200) =>
  HttpServerResponse.json(body, { status })

const errorResponse = (error: string, description: string, status = 400) =>
  HttpServerResponse.json({ error, error_description: description }, { status })

const parseFormBody = (request: HttpServerRequest.HttpServerRequest) =>
  Effect.gen(function* () {
    const body = yield* request.text
    return new URLSearchParams(body)
  })

// ── Combined Router ────────────────────────────────────────────────────

export const OAuthRoutes = HttpRouter.empty.pipe(
  // ── Server Metadata ────────────────────────────────────────────────
  HttpRouter.get(
    '/.well-known/oauth-authorization-server',
    HttpServerResponse.json({
      issuer: MCP_SERVER_URL,
      authorization_endpoint: `${MCP_SERVER_URL}/oauth/authorize`,
      token_endpoint: `${MCP_SERVER_URL}/oauth/token`,
      registration_endpoint: `${MCP_SERVER_URL}/oauth/register`,
      revocation_endpoint: `${MCP_SERVER_URL}/oauth/revoke`,
      scopes_supported: SCOPES_SUPPORTED,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
    })
  ),

  // ── MCP Discovery Metadata ───────────────────────────────────────
  HttpRouter.get(
    '/.well-known/mcp.json',
    HttpServerResponse.json({
      name: 'lily-plant-care',
      version: '1.0.0',
      protocol_version: '2025-03-26',
      mcp_endpoint: `${MCP_SERVER_URL}/mcp`,
      authentication: {
        type: 'oauth2',
        authorization_server: `${MCP_SERVER_URL}/.well-known/oauth-authorization-server`,
        protected_resource: `${MCP_SERVER_URL}/.well-known/oauth-protected-resource`,
      },
      capabilities: { tools: true, resources: true },
    })
  ),

  // ── Protected Resource Metadata ────────────────────────────────────
  HttpRouter.get(
    '/.well-known/oauth-protected-resource',
    HttpServerResponse.json({
      resource: `${MCP_SERVER_URL}/mcp`,
      authorization_servers: [MCP_SERVER_URL],
      scopes_supported: SCOPES_SUPPORTED,
      bearer_methods_supported: ['header'],
      resource_name: 'Lily Plant Care',
    })
  ),

  // ── Client Registration ────────────────────────────────────────────
  HttpRouter.post(
    '/oauth/register',
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const body = yield* request.json
      const oauthService = yield* OAuthService

      const parsed = yield* Schema.decodeUnknown(ClientRegistrationBody)(body)

      const client = yield* oauthService.registerClient(parsed)
      return yield* jsonResponse(client, 201)
    }).pipe(
      Effect.catchTag('ParseError', () =>
        errorResponse('invalid_request', 'Invalid registration request body')
      ),
      Effect.catchTag('SqlError', () =>
        errorResponse('server_error', 'An internal error occurred', 500)
      )
    )
  ),

  // ── Authorize (redirect to consent) ────────────────────────────────
  HttpRouter.get(
    '/oauth/authorize',
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const url = new URL(request.url, MCP_SERVER_URL)
      const params = url.searchParams
      const oauthService = yield* OAuthService

      const clientId = params.get('client_id')
      if (!clientId) {
        return yield* errorResponse('invalid_request', 'Missing client_id')
      }

      const maybeClient = yield* oauthService.getClient(clientId)
      if (Option.isNone(maybeClient)) {
        return yield* errorResponse('invalid_request', 'Unknown client')
      }
      const client = maybeClient.value

      const redirectUri = params.get('redirect_uri')
      if (!redirectUri) {
        return yield* errorResponse('invalid_request', 'Missing redirect_uri')
      }

      if (
        !Array.some(
          client.redirect_uris as string[],
          (uri) => uri === redirectUri
        )
      ) {
        return yield* errorResponse(
          'invalid_request',
          'redirect_uri not registered for this client'
        )
      }

      const consentUrl = new URL(`${MCP_SERVER_URL}/consent`)
      for (const [key, value] of params.entries()) {
        consentUrl.searchParams.set(key, value)
      }
      if (client.client_name) {
        consentUrl.searchParams.set('client_name', client.client_name)
      }
      if (client.client_uri) {
        consentUrl.searchParams.set('client_uri', client.client_uri)
      }
      if (client.logo_uri) {
        consentUrl.searchParams.set('logo_uri', client.logo_uri)
      }

      return HttpServerResponse.redirect(consentUrl.toString(), {
        status: 302,
      })
    }).pipe(
      Effect.catchTag('SqlError', () =>
        errorResponse('server_error', 'An internal error occurred', 500)
      )
    )
  ),

  // ── Token Exchange ─────────────────────────────────────────────────
  HttpRouter.post(
    '/oauth/token',
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const form = yield* parseFormBody(request)
      const oauthService = yield* OAuthService

      const grantType = form.get('grant_type')

      if (grantType === 'authorization_code') {
        const code = form.get('code')
        const clientId = form.get('client_id')
        const codeVerifier = form.get('code_verifier')

        if (!code || !clientId || !codeVerifier) {
          return yield* errorResponse(
            'invalid_request',
            'Missing code, client_id, or code_verifier'
          )
        }

        const result = yield* oauthService.exchangeAuthorizationCode({
          code,
          clientId,
          codeVerifier,
        })

        return yield* jsonResponse(result)
      }

      if (grantType === 'refresh_token') {
        const refreshToken = form.get('refresh_token')
        const clientId = form.get('client_id')

        if (!refreshToken || !clientId) {
          return yield* errorResponse(
            'invalid_request',
            'Missing refresh_token or client_id'
          )
        }

        const result = yield* oauthService.refreshAccessToken({
          refreshToken,
          clientId,
        })

        // Proactively refresh the API JWT if it's stale
        yield* refreshApiJwtIfNeeded(result._userId).pipe(
          Effect.tapError((err) =>
            Effect.logWarning('JWT refresh failed', {
              error: err.message,
            })
          ),
          Effect.ignore
        )

        // Strip internal _userId before sending the OAuth response
        const { _userId: _, ...oauthResponse } = result
        return yield* jsonResponse(oauthResponse)
      }

      return yield* errorResponse(
        'unsupported_grant_type',
        'The requested grant type is not supported'
      )
    }).pipe(
      Effect.catchTag('OAuthError', (err) =>
        errorResponse(err.error, err.error_description)
      ),
      Effect.catchTag('SqlError', () =>
        errorResponse('server_error', 'An internal error occurred', 500)
      )
    )
  ),

  // ── Token Revocation ───────────────────────────────────────────────
  HttpRouter.post(
    '/oauth/revoke',
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const form = yield* parseFormBody(request)
      const oauthService = yield* OAuthService

      const tokenValue = form.get('token')
      if (!tokenValue) {
        return yield* errorResponse('invalid_request', 'Missing token')
      }

      const rawHint = form.get('token_type_hint')
      const tokenTypeHint =
        rawHint === 'access_token' || rawHint === 'refresh_token'
          ? rawHint
          : undefined

      yield* oauthService.revokeToken({
        token: tokenValue,
        ...(tokenTypeHint != null ? { token_type_hint: tokenTypeHint } : {}),
      })

      return HttpServerResponse.empty({ status: 200 })
    }).pipe(
      Effect.catchTag('SqlError', () =>
        errorResponse('server_error', 'An internal error occurred', 500)
      )
    )
  )
)
