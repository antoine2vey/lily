import { OAuthIdentityRepository } from '@lily/api/repositories/oauth-identity.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { issueSession } from '@lily/api/services/auth/helpers/issue-session'
import {
  OAuthVerifierService,
  type OAuthIdentity as VerifiedIdentity,
} from '@lily/api/services/oauth-verifier/service'
import { trimAndNullify } from '@lily/shared'
import type { OAuthSignInRequest } from '@lily/shared/auth'
import { Array, Effect, Match, Option, pipe } from 'effect'

const buildFullName = (
  fullName: OAuthSignInRequest['fullName'],
  fromToken: string | null
): string | null => {
  const fromPayload = pipe(
    Option.fromNullable(fullName),
    Option.flatMap((parts) => {
      const given = pipe(
        Option.fromNullable(parts.givenName),
        Option.getOrElse(() => '')
      )
      const family = pipe(
        Option.fromNullable(parts.familyName),
        Option.getOrElse(() => '')
      )
      const combined = `${given} ${family}`.trim()
      return combined.length > 0 ? Option.some(combined) : Option.none()
    })
  )
  return pipe(
    fromPayload,
    Option.orElse(() => Option.fromNullable(fromToken)),
    Option.getOrElse<string | null>(() => null)
  )
}

/**
 * Verify an Apple/Google ID token and exchange it for our JWT pair.
 *
 * Flow:
 *  1. Verify the provider ID token (JWKS, audience, expiry).
 *  2. If an `oauth_identities` row already exists for (provider, sub) → load
 *     that user and issue a session (refresh snapshot fields for next time).
 *  3. Otherwise look up `users` by email:
 *     - Hit + at least one side verified → link new identity to existing user.
 *     - Hit + neither verified → fail (security).
 *     - Miss → create user + link identity.
 *  4. Issue JWT + refresh token via `issueSession`.
 */
export const oauthSignIn = Effect.fn('AuthService.oauthSignIn')(function* (
  payload: OAuthSignInRequest
) {
  const verifier = yield* OAuthVerifierService
  const userRepo = yield* UserRepository
  const identityRepo = yield* OAuthIdentityRepository

  const verified: VerifiedIdentity = yield* pipe(
    Match.value(payload.provider),
    Match.when('apple', () => verifier.verifyApple(payload.idToken)),
    Match.when('google', () => verifier.verifyGoogle(payload.idToken)),
    Match.exhaustive,
    Effect.catchTag('OAuthVerificationError', (err) =>
      Effect.fail({ message: err.message })
    )
  )

  const fullName = buildFullName(payload.fullName, verified.name)

  // Apple first-time `fullName` wins over the verifier's ID-token claims
  // (Google `given_name`/`family_name`). `trimAndNullify` collapses empty
  // and whitespace strings to null so we never persist blanks.
  const pickName = (
    candidates: ReadonlyArray<string | null | undefined>
  ): string | null =>
    pipe(
      candidates,
      Array.map(trimAndNullify),
      Array.findFirst((s): s is string => s !== null),
      Option.getOrElse<string | null>(() => null)
    )
  const firstName = pickName([payload.fullName?.givenName, verified.firstName])
  const lastName = pickName([payload.fullName?.familyName, verified.lastName])

  const existingIdentity = yield* identityRepo.findByProviderId(
    payload.provider,
    verified.sub
  )

  const linkedUser = yield* pipe(
    Option.fromNullable(existingIdentity),
    Option.match({
      onNone: () => Effect.succeed(null),
      onSome: (identity) =>
        Effect.gen(function* () {
          yield* identityRepo.refreshSnapshot(identity.id, {
            providerEmail: verified.email,
            providerName: fullName,
          })
          return yield* userRepo.findById(identity.userId)
        }),
    })
  )

  const user = yield* pipe(
    Option.fromNullable(linkedUser),
    Option.match({
      onNone: () =>
        Effect.gen(function* () {
          const existingByEmail = yield* userRepo.findByEmail(verified.email)

          const targetUser = yield* pipe(
            Option.fromNullable(existingByEmail),
            Option.match({
              onNone: () =>
                // Intentionally do NOT populate `name` (the @handle) here —
                // user picks it via /(auth)/username. We DO populate
                // first/last name from provider data, so signed-in users see
                // their real name on the profile screen right away.
                userRepo.create({
                  email: verified.email,
                  emailVerified: verified.emailVerified,
                  ...(firstName ? { firstName } : {}),
                  ...(lastName ? { lastName } : {}),
                  ...(payload.timezone ? { timezone: payload.timezone } : {}),
                  ...(payload.language ? { language: payload.language } : {}),
                }),
              onSome: (existing) =>
                Effect.gen(function* () {
                  const eitherVerified =
                    existing.emailVerified || verified.emailVerified
                  if (!eitherVerified) {
                    return yield* Effect.fail({
                      message:
                        'An account with this email exists but cannot be verified for merging. Sign in with magic link first.',
                    })
                  }
                  if (!existing.emailVerified && verified.emailVerified) {
                    const updated = yield* userRepo.update(existing.id, {
                      emailVerified: true,
                    })
                    return pipe(
                      Option.fromNullable(updated),
                      Option.getOrElse(() => existing)
                    )
                  }
                  return existing
                }),
            })
          )

          if (!targetUser) {
            return yield* Effect.fail({ message: 'Failed to create user' })
          }

          yield* identityRepo.link({
            userId: targetUser.id,
            provider: payload.provider,
            providerUserId: verified.sub,
            providerEmail: verified.email,
            providerName: fullName,
          })

          return targetUser
        }),
      onSome: (u) => Effect.succeed(u),
    })
  )

  if (user.status !== 'active') {
    return yield* Effect.fail({
      message: 'Account is not active',
      status: user.status,
    })
  }

  return yield* issueSession(user)
})
