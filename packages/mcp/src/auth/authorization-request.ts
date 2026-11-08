import { OAuthError, OAuthService } from '@lily/mcp/auth/oauth-service'
import { grantScopes, type Scope } from '@lily/mcp/auth/scopes'
import { Array, Effect, Option, pipe } from 'effect'

export interface AuthorizationRequest {
  readonly clientId: string
  readonly redirectUri: string
  readonly codeChallenge: string
  readonly scopes: readonly Scope[]
  readonly state?: string
  readonly resource?: string
}

const reject = (error: string, description: string) =>
  new OAuthError({ error, error_description: description })

/**
 * Validates the OAuth authorization parameters a client sent, before any
 * side effect (email, magic link, authorization code) depends on them.
 */
export const parseAuthorizationRequest = (params: URLSearchParams) =>
  Effect.gen(function* () {
    const oauthService = yield* OAuthService

    const clientId = params.get('client_id')
    if (!clientId) {
      return yield* reject('invalid_request', 'Missing client_id')
    }

    const client = yield* oauthService.getClient(clientId).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.fail(reject('invalid_client', 'Unknown client')),
          onSome: Effect.succeed,
        })
      )
    )

    const redirectUri = params.get('redirect_uri')
    const codeChallenge = params.get('code_challenge')
    if (!redirectUri || !codeChallenge) {
      return yield* reject(
        'invalid_request',
        'Missing redirect_uri or code_challenge'
      )
    }

    if (!Array.contains(client.redirect_uris, redirectUri)) {
      return yield* reject(
        'invalid_request',
        'redirect_uri does not match registered URIs'
      )
    }

    const codeChallengeMethod = pipe(
      Option.fromNullishOr(params.get('code_challenge_method')),
      Option.getOrElse(() => 'S256')
    )
    if (codeChallengeMethod !== 'S256') {
      return yield* reject(
        'invalid_request',
        'Only S256 code_challenge_method is supported'
      )
    }

    const scopes = yield* pipe(
      grantScopes(params.get('scope')),
      Option.match({
        onNone: () =>
          Effect.fail(reject('invalid_scope', 'Unsupported scope requested')),
        onSome: Effect.succeed,
      })
    )

    const state = params.get('state')
    const resource = params.get('resource')

    const request: AuthorizationRequest = {
      clientId,
      redirectUri,
      codeChallenge,
      scopes,
      ...(state != null ? { state } : {}),
      ...(resource != null ? { resource } : {}),
    }
    return request
  })
