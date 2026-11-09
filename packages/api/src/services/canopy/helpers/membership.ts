import {
  type CanopyMembership,
  CanopyRepository,
  type CanopyRow,
} from '@lily/api/repositories/canopy.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { returnSharedPlants } from '@lily/api/services/canopy/helpers/return-shared-plants'
import type { ReminderContext } from '@lily/api/services/plants/helpers/reconcile-reminders'
import {
  reminderKeysFor,
  requireReminderKeys,
} from '@lily/api/services/plants/helpers/reminder-keys'
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

/**
 * Ends a membership. With `'return'`, the member's shared plants go back to
 * them first. Runs inside a lock plan that holds the Canopy's plant reminders.
 */
export const dropMember = (
  canopyId: string,
  userId: string,
  sharedPlants: 'return' | 'stay'
): Effect.Effect<void, SqlError, ReminderContext> =>
  Effect.gen(function* () {
    const repo = yield* CanopyRepository
    const notificationRepo = yield* NotificationRepository
    const plantIds = yield* repo.findPlantIdsOfCanopy(canopyId)
    yield* requireReminderKeys(reminderKeysFor(plantIds))(
      Effect.gen(function* () {
        if (sharedPlants === 'return') {
          yield* returnSharedPlants(canopyId, userId)
        }
        yield* repo.deleteMemberMutes(canopyId, userId)
        yield* repo.removeMember(canopyId, userId)
        yield* repo.withdrawInvitationsSentBy(canopyId, userId)
        yield* notificationRepo.deleteUndeliveredForMemberOnCanopy(
          userId,
          canopyId
        )
      })
    )
  })
