import { HttpServerRequest, HttpServerResponse } from '@effect/platform'
import { MagicLinkRepository } from '@lily/api/repositories/magic-link.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { OAuthService } from '@lily/mcp/auth/oauth-service'
import { MCP_SERVER_URL } from '@lily/mcp/config'
import { Array, Effect, String as EffectString, Option, pipe } from 'effect'

const errorHtml = (message: string) =>
  HttpServerResponse.text(
    `<html><body style="font-family:sans-serif;padding:2rem;text-align:center">
      <h2>Authentication failed</h2>
      <p>${message}</p>
      <p>Please close this window and try again.</p>
    </body></html>`,
    {
      status: 400,
      contentType: 'text/html',
    }
  )

/**
 * Handles GET /verify — magic link callback.
 *
 * Called when the user clicks the magic link in their email.
 * Verifies the code, resolves the user, creates an authorization code
 * via OAuthService, and redirects back to the MCP client.
 */
export const verifyHandler = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest
  const url = new URL(request.url, MCP_SERVER_URL)
  const params = url.searchParams

  const code = params.get('code')
  if (!code) {
    return errorHtml('Missing verification code')
  }

  const magicLinkRepo = yield* MagicLinkRepository
  const userRepo = yield* UserRepository
  const oauthService = yield* OAuthService

  // Verify magic link
  const magicLink = yield* magicLinkRepo.findValidAndMarkUsed(code)
  if (!magicLink) {
    return errorHtml('Invalid or expired code')
  }

  const normalizedEmail = pipe(
    magicLink.email,
    EffectString.toLowerCase,
    EffectString.trim
  )

  // Resolve user
  const user = yield* userRepo.findByEmail(normalizedEmail)
  if (!user) {
    return errorHtml('No account found for this email')
  }

  // Validate required OAuth params
  const clientId = params.get('client_id')
  if (!clientId) {
    return errorHtml('Missing client_id')
  }

  const maybeClient = yield* oauthService.getClient(clientId)
  if (Option.isNone(maybeClient)) {
    return errorHtml('Unknown client')
  }
  const client = maybeClient.value

  const redirectUri = params.get('redirect_uri')
  const codeChallenge = params.get('code_challenge')
  if (!redirectUri || !codeChallenge) {
    return errorHtml('Missing redirect_uri or code_challenge')
  }

  // Validate redirect_uri against registered URIs (RFC 6749 §10.6)
  if (
    !Array.some(client.redirect_uris as string[], (uri) => uri === redirectUri)
  ) {
    return errorHtml('redirect_uri does not match registered URIs')
  }

  // Validate code_challenge_method — only S256 is supported
  const codeChallengeMethod = pipe(
    Option.fromNullable(params.get('code_challenge_method')),
    Option.getOrElse(() => 'S256')
  )
  if (codeChallengeMethod !== 'S256') {
    return errorHtml('Only S256 code_challenge_method is supported')
  }

  const scopes = pipe(
    Option.fromNullable(params.get('scope')),
    Option.map((s) => EffectString.split(s, ' ')),
    Option.map(Array.fromIterable),
    Option.getOrElse(() => [] as string[])
  )
  const state = Option.getOrUndefined(Option.fromNullable(params.get('state')))
  const resource = Option.getOrUndefined(
    Option.fromNullable(params.get('resource'))
  )

  // Create authorization code
  const authCode = yield* oauthService.createAuthorizationCode({
    clientId,
    userId: user.id,
    redirectUri,
    codeChallenge,
    scopes,
    ...(state != null ? { state } : {}),
    ...(resource != null ? { resource } : {}),
  })

  // Redirect back to client with auth code
  const redirectUrl = new URL(redirectUri)
  redirectUrl.searchParams.set('code', authCode)
  if (state) {
    redirectUrl.searchParams.set('state', state)
  }

  return HttpServerResponse.redirect(redirectUrl.toString(), {
    status: 302,
  })
}).pipe(
  Effect.catchTag('SqlError', () =>
    Effect.succeed(errorHtml('Authentication failed'))
  ),
  Effect.withSpan('MCP.verify')
)
