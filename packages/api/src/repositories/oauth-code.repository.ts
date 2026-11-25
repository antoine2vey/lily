import * as PgDrizzle from '@lily/db/effect-drizzle'
import { oauthAuthorizationCodes } from '@lily/db/schema'
import { nowAsDate } from '@lily/shared'
import { lt } from 'drizzle-orm'
import { Context, Effect, Layer } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

/**
 * The mcp server writes and spends authorization codes. It runs no
 * scheduler, so the api deletes the ones nobody spent.
 */
export interface IOAuthCodeRepository {
  readonly deleteExpired: Effect.Effect<number, SqlError>
}

export class OAuthCodeRepository extends Context.Service<
  OAuthCodeRepository,
  IOAuthCodeRepository
>()('OAuthCodeRepository') {}

export const OAuthCodeRepositoryLive = Layer.effect(
  OAuthCodeRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      deleteExpired: Effect.gen(function* () {
        const result = yield* db
          .delete(oauthAuthorizationCodes)
          .where(lt(oauthAuthorizationCodes.expiresAt, nowAsDate()))
          .returning({ code: oauthAuthorizationCodes.authorizationCode })

        return result.length
      }).pipe(Effect.withSpan('OAuthCodeRepository.deleteExpired')),
    }
  })
)
