import {
  type CanopyMembership,
  CanopyRepository,
  type CanopyRow,
} from '@lily/api/repositories/canopy.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import {
  AlreadyInCanopyError,
  CanopyNotFoundError,
  NotCanopyOwnerError,
} from '@lily/shared'
import { Effect, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const requireMembership = (
  userId: string
): Effect.Effect<
  CanopyMembership,
  CanopyNotFoundError | SqlError,
  CanopyRepository
> =>
  Effect.flatMap(CanopyRepository, (repo) =>
    repo.findMembershipByUser(userId)
  ).pipe(
    Effect.flatMap((membership) =>
      membership === null
        ? Effect.fail(new CanopyNotFoundError())
        : Effect.succeed(membership)
    )
  )

export const failAlreadyInCanopy = (
  canopyId: string
): Effect.Effect<never, AlreadyInCanopyError | SqlError, CanopyRepository> =>
  Effect.flatMap(CanopyRepository, (repo) => repo.findById(canopyId)).pipe(
    Effect.flatMap((canopy) =>
      Effect.fail(
        new AlreadyInCanopyError({
          canopyName: pipe(
            Option.fromNullishOr(canopy),
            Option.map((c) => c.name),
            Option.getOrElse(() => '')
          ),
        })
      )
    )
  )

export const requireOwner = (
  membership: CanopyMembership
): Effect.Effect<void, NotCanopyOwnerError> =>
  membership.role === 'owner'
    ? Effect.void
    : Effect.fail(new NotCanopyOwnerError())

export interface LockedCanopy {
  readonly canopy: CanopyRow
  readonly membership: CanopyMembership
}

/**
 * Locks the user's Canopy row, then reads the membership again under the
 * lock, so a concurrent leave, removal, or dissolve is seen before writing.
 * Only meaningful inside `SqlClient.withTransaction`.
 */
export const lockMyCanopy = (
  userId: string
): Effect.Effect<
  LockedCanopy,
  CanopyNotFoundError | SqlError,
  CanopyRepository
> =>
  Effect.gen(function* () {
    const repo = yield* CanopyRepository
    const seen = yield* requireMembership(userId)
    const canopy = yield* repo.lock(seen.canopyId)
    const membership = yield* requireMembership(userId)
    if (canopy === null || membership.canopyId !== canopy.id) {
      return yield* new CanopyNotFoundError()
    }
    return { canopy, membership }
  })

/**
 * Ends one membership: the row, the member's mutes on Canopy plants, and the
 * member's pending notifications for them. Ownership is the caller's concern.
 */
export const dropMember = (
  canopyId: string,
  userId: string
): Effect.Effect<
  boolean,
  SqlError,
  CanopyRepository | NotificationRepository
> =>
  Effect.gen(function* () {
    const repo = yield* CanopyRepository
    const notificationRepo = yield* NotificationRepository
    yield* repo.deleteMemberMutes(canopyId, userId)
    yield* notificationRepo.deletePendingForMemberOnCanopy(userId, canopyId)
    return yield* repo.removeMember(canopyId, userId)
  })
