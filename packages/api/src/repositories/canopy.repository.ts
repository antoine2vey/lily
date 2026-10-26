import * as PgDrizzle from '@lily/db/effect-drizzle'
import { canopies, canopyMembers } from '@lily/db/schema'
import type { CanopyMemberRole } from '@lily/shared'
import { eq } from 'drizzle-orm'
import { Context, Effect, Layer, Option } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export interface CanopyMembership {
  readonly canopyId: string
  readonly role: CanopyMemberRole
  readonly joinedAt: Date
  readonly canopy: typeof canopies.$inferSelect
}

export interface ICanopyRepository {
  readonly findMembershipByUser: (
    userId: string
  ) => Effect.Effect<CanopyMembership | null, SqlError>
}

export class CanopyRepository extends Context.Service<
  CanopyRepository,
  ICanopyRepository
>()('CanopyRepository') {}

export const CanopyRepositoryLive = Layer.effect(
  CanopyRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      findMembershipByUser: Effect.fn('CanopyRepository.findMembershipByUser')(
        function* (userId: string) {
          const [row] = yield* db
            .select({
              canopyId: canopyMembers.canopyId,
              role: canopyMembers.role,
              joinedAt: canopyMembers.joinedAt,
              canopy: canopies,
            })
            .from(canopyMembers)
            .innerJoin(canopies, eq(canopyMembers.canopyId, canopies.id))
            .where(eq(canopyMembers.userId, userId))
            .limit(1)
          return Option.getOrNull(Option.fromNullishOr(row))
        }
      ),
    }
  })
)
