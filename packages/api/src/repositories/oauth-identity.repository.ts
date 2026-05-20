import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { oauthIdentities } from '@lily/db/schema/oauth-identities'
import { and, eq } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'

export type OAuthIdentity = typeof oauthIdentities.$inferSelect
export type OAuthProvider = 'apple' | 'google'

export interface LinkIdentityData {
  userId: string
  provider: OAuthProvider
  providerUserId: string
  providerEmail: string | null
  providerName: string | null
}

export interface IOAuthIdentityRepository {
  readonly findByProviderId: (
    provider: OAuthProvider,
    providerUserId: string
  ) => Effect.Effect<OAuthIdentity | null, SqlError>
  readonly link: (
    data: LinkIdentityData
  ) => Effect.Effect<OAuthIdentity | null, SqlError>
  readonly refreshSnapshot: (
    id: string,
    data: { providerEmail: string | null; providerName: string | null }
  ) => Effect.Effect<OAuthIdentity | null, SqlError>
}

export class OAuthIdentityRepository extends Context.Tag(
  'OAuthIdentityRepository'
)<OAuthIdentityRepository, IOAuthIdentityRepository>() {}

export const OAuthIdentityRepositoryLive = Layer.effect(
  OAuthIdentityRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      findByProviderId: Effect.fn('OAuthIdentityRepository.findByProviderId')(
        function* (provider: OAuthProvider, providerUserId: string) {
          const results = yield* db
            .select()
            .from(oauthIdentities)
            .where(
              and(
                eq(oauthIdentities.provider, provider),
                eq(oauthIdentities.providerUserId, providerUserId)
              )
            )
          return pipe(results, Array.head, Option.getOrNull)
        }
      ),

      link: Effect.fn('OAuthIdentityRepository.link')(function* (
        data: LinkIdentityData
      ) {
        const results = yield* db
          .insert(oauthIdentities)
          .values({
            userId: data.userId,
            provider: data.provider,
            providerUserId: data.providerUserId,
            providerEmail: data.providerEmail,
            providerName: data.providerName,
          })
          .returning()
        return pipe(results, Array.head, Option.getOrNull)
      }),

      refreshSnapshot: Effect.fn('OAuthIdentityRepository.refreshSnapshot')(
        function* (
          id: string,
          data: { providerEmail: string | null; providerName: string | null }
        ) {
          const results = yield* db
            .update(oauthIdentities)
            .set({
              providerEmail: data.providerEmail,
              providerName: data.providerName,
            })
            .where(eq(oauthIdentities.id, id))
            .returning()
          return pipe(results, Array.head, Option.getOrNull)
        }
      ),
    }
  })
)
