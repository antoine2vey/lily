import appleSignin from 'apple-signin-auth'
import { Config, Context, Effect, Layer, Option, pipe } from 'effect'
import { OAuth2Client } from 'google-auth-library'
import { OAuthVerificationError } from './errors'

/**
 * Normalized identity returned after verifying a provider ID token.
 *
 * `name` is the full concatenated display name (provider-supplied), used as a
 * snapshot on `oauth_identities` for audit. `firstName`/`lastName` are the
 * granular parts — Google exposes them via `given_name`/`family_name` ID-token
 * claims; Apple does NOT include them in the ID token (they arrive only on
 * first-time client-side `fullName`, plumbed through the request payload).
 */
export interface OAuthIdentity {
  readonly sub: string
  readonly email: string
  readonly emailVerified: boolean
  readonly name: string | null
  readonly firstName: string | null
  readonly lastName: string | null
}

export interface IOAuthVerifierService {
  readonly verifyApple: (
    idToken: string
  ) => Effect.Effect<OAuthIdentity, OAuthVerificationError>
  readonly verifyGoogle: (
    idToken: string
  ) => Effect.Effect<OAuthIdentity, OAuthVerificationError>
}

export class OAuthVerifierService extends Context.Tag('OAuthVerifierService')<
  OAuthVerifierService,
  IOAuthVerifierService
>() {}

const OAuthConfig = Config.all({
  appleBundleId: Config.withDefault(
    Config.string('APPLE_BUNDLE_ID'),
    'com.lilyapp.app'
  ),
  googleWebClientId: Config.string('GOOGLE_OAUTH_WEB_CLIENT_ID'),
  googleIosClientId: Config.option(Config.string('GOOGLE_OAUTH_IOS_CLIENT_ID')),
  googleAndroidClientId: Config.option(
    Config.string('GOOGLE_OAUTH_ANDROID_CLIENT_ID')
  ),
})

/**
 * Coerce Apple/Google's `email_verified` claim — Apple returns a string
 * 'true'/'false', Google returns a boolean. Some libs already normalize, but
 * we belt-and-suspender it here.
 */
const coerceVerified = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value.toLowerCase() === 'true'
  return false
}

export const OAuthVerifierServiceLive = Layer.effect(
  OAuthVerifierService,
  Effect.gen(function* () {
    const config = yield* OAuthConfig

    const googleAudiences: string[] = [config.googleWebClientId]
    if (config.googleIosClientId._tag === 'Some') {
      googleAudiences.push(config.googleIosClientId.value)
    }
    if (config.googleAndroidClientId._tag === 'Some') {
      googleAudiences.push(config.googleAndroidClientId.value)
    }

    const googleClient = new OAuth2Client(config.googleWebClientId)

    return {
      verifyApple: Effect.fn('OAuthVerifierService.verifyApple')(function* (
        idToken: string
      ) {
        return yield* Effect.tryPromise({
          try: async () => {
            const payload = await appleSignin.verifyIdToken(idToken, {
              audience: config.appleBundleId,
              ignoreExpiration: false,
            })
            const sub = payload.sub
            const email = payload.email
            if (!sub || !email) {
              throw new Error('Apple token missing sub/email')
            }
            return {
              sub,
              email,
              emailVerified: coerceVerified(payload.email_verified),
              name: null,
              firstName: null,
              lastName: null,
            } satisfies OAuthIdentity
          },
          catch: (error) =>
            new OAuthVerificationError({
              provider: 'apple',
              message: `Apple token verification failed: ${String(error)}`,
            }),
        })
      }),

      verifyGoogle: Effect.fn('OAuthVerifierService.verifyGoogle')(function* (
        idToken: string
      ) {
        return yield* Effect.tryPromise({
          try: async () => {
            const ticket = await googleClient.verifyIdToken({
              idToken,
              audience: googleAudiences,
            })
            const payload = ticket.getPayload()
            if (!payload?.sub || !payload.email) {
              throw new Error('Google token missing sub/email')
            }
            return {
              sub: payload.sub,
              email: payload.email,
              emailVerified: coerceVerified(payload.email_verified),
              name: pipe(
                Option.fromNullable(payload.name),
                Option.getOrElse<string | null>(() => null)
              ),
              firstName: pipe(
                Option.fromNullable(payload.given_name),
                Option.getOrElse<string | null>(() => null)
              ),
              lastName: pipe(
                Option.fromNullable(payload.family_name),
                Option.getOrElse<string | null>(() => null)
              ),
            } satisfies OAuthIdentity
          },
          catch: (error) =>
            new OAuthVerificationError({
              provider: 'google',
              message: `Google token verification failed: ${String(error)}`,
            }),
        })
      }),
    }
  })
)
