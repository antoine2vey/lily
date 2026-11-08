import { createHmac, timingSafeEqual } from 'node:crypto'
import type { AuthorizationRequest } from '@lily/mcp/auth/authorization-request'
import { SCOPES_SUPPORTED } from '@lily/mcp/auth/scopes'
import { Config, Duration, Option, Redacted, Schema } from 'effect'

export const PENDING_COOKIE = 'lily_mcp_pending'

/** Matches the API's magic link expiry, so the cookie never outlives the link. */
export const PENDING_TTL = Duration.minutes(10)

export interface PendingAuthorization extends AuthorizationRequest {
  readonly id: string
  readonly expiresAt: number
}

const PendingAuthorizationSchema = Schema.fromJsonString(
  Schema.Struct({
    id: Schema.String,
    expiresAt: Schema.Number,
    clientId: Schema.String,
    redirectUri: Schema.String,
    codeChallenge: Schema.String,
    scopes: Schema.Array(Schema.Literals(SCOPES_SUPPORTED)),
    state: Schema.optionalKey(Schema.String),
    resource: Schema.optionalKey(Schema.String),
  })
)

const decodePending = Schema.decodeUnknownOption(PendingAuthorizationSchema)

export const PendingSecret = Config.Redacted('SERVICE_TOKEN_SECRET')

/** `Secure` only over https: browsers drop Secure cookies set by http://localhost. */
export const cookieOptions = (serverUrl: string) => ({
  httpOnly: true,
  secure: serverUrl.startsWith('https://'),
  sameSite: 'lax' as const,
  path: '/verify',
})

const sign = (secret: Redacted.Redacted, payload: string) =>
  createHmac('sha256', Redacted.value(secret))
    .update(payload)
    .digest('base64url')

export const seal = (
  secret: Redacted.Redacted,
  pending: PendingAuthorization
) => {
  const payload = Buffer.from(JSON.stringify(pending)).toString('base64url')
  return `${payload}.${sign(secret, payload)}`
}

export const open = (
  secret: Redacted.Redacted,
  sealed: string,
  nowMs: number
): Option.Option<PendingAuthorization> => {
  const [payload, signature] = sealed.split('.')
  if (!payload || !signature) {
    return Option.none()
  }
  const expected = Buffer.from(sign(secret, payload))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return Option.none()
  }
  return decodePending(Buffer.from(payload, 'base64url').toString('utf8')).pipe(
    Option.filter((pending) => pending.expiresAt > nowMs)
  )
}
