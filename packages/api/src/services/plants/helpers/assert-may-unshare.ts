import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import type { PlantRow } from '@lily/api/repositories/plant.repository'
import type { LockedCanopy } from '@lily/api/services/plants/helpers/plant-change'
import { PlantNotAuthorizedError } from '@lily/shared/errors/plant'
import { Effect, Match, Option } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

const sharerStillMember = (
  createdByUserId: string | null,
  canopyId: string
): Effect.Effect<boolean, SqlError, CanopyRepository> =>
  Option.match(Option.fromNullishOr(createdByUserId), {
    onNone: () => Effect.succeed(false),
    onSome: (sharer) =>
      Effect.map(
        Effect.flatMap(CanopyRepository, (repo) =>
          repo.findMembershipByUser(sharer)
        ),
        (membership) =>
          Option.exists(
            Option.fromNullishOr(membership),
            (m) => m.canopyId === canopyId
          )
      ),
  })

/**
 * The member who shared a plant can make it personal. The Canopy owner can
 * only once that member has left the Canopy, so the owner never takes a plant
 * from someone still in it. Runs inside `movePlant` so a leave can't race.
 */
export const assertMayUnshare = (
  plant: Pick<PlantRow, 'createdByUserId'>,
  { canopy, membership }: LockedCanopy,
  userId: string
): Effect.Effect<void, PlantNotAuthorizedError | SqlError, CanopyRepository> =>
  plant.createdByUserId === userId
    ? Effect.void
    : Effect.flatMap(
        sharerStillMember(plant.createdByUserId, canopy.id),
        (sharerHere) =>
          Match.value({ owner: membership.role === 'owner', sharerHere }).pipe(
            Match.when({ owner: true, sharerHere: false }, () => Effect.void),
            Match.orElse(() => Effect.fail(new PlantNotAuthorizedError()))
          )
      )
