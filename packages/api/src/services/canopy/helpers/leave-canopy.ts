import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import type { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import type { PlantRepository } from '@lily/api/repositories/plant.repository'
import type { RecipientRepository } from '@lily/api/repositories/recipient.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import { dissolveCanopy } from '@lily/api/services/canopy/helpers/dissolve-canopy'
import { dropMember } from '@lily/api/services/canopy/helpers/membership'
import { senderNameOf } from '@lily/api/services/canopy/helpers/notify-member'
import {
  dispatchNow,
  type RecordedNotification,
  recordNotification,
} from '@lily/api/services/helpers/schedule-notification'
import type { LockedCanopy } from '@lily/api/services/plants/helpers/plant-change'
import { changeMember } from '@lily/api/services/plants/helpers/plant-change'
import { CanopyNotFoundError } from '@lily/shared'
import type { MessageQueue } from '@lily/shared/server'
import { Array, Data, Effect, Option, pipe } from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export type LeaveOutcome = Data.TaggedEnum<{
  Left: { readonly notification: RecordedNotification }
  Dissolved: {}
}>

export const LeaveOutcome = Data.taggedEnum<LeaveOutcome>()

type LeaveContext =
  | SqlClient.SqlClient
  | CanopyRepository
  | CareScheduleRepository
  | NotificationRepository
  | PlantRepository
  | UserRepository
  | DelegationRepository
  | RecipientRepository
  | MessageQueue

const leaveLocked = (
  { canopy }: LockedCanopy,
  userId: string,
  sharedPlants: 'return' | 'stay'
): Effect.Effect<LeaveOutcome, SqlError, LeaveContext> =>
  Effect.gen(function* () {
    const repo = yield* CanopyRepository
    const members = yield* repo.findMembersByJoinDate(canopy.id)
    const leaver = yield* Option.match(
      Array.findFirst(members, (m) => m.userId === userId),
      {
        onNone: () => Effect.die(new Error('member row missing')),
        onSome: Effect.succeed,
      }
    )
    const staying = Array.filter(members, (m) => m.userId !== userId)
    const owner = pipe(
      staying,
      Array.findFirst((m) => m.role === 'owner'),
      Option.orElse(() => Array.head(staying))
    )

    if (Option.isNone(owner)) {
      yield* dissolveCanopy(canopy.id, userId)
      return LeaveOutcome.Dissolved()
    }

    yield* dropMember(canopy.id, userId, sharedPlants)
    yield* repo.revokeInviteCreatedBy(canopy.id, userId)
    if (owner.value.role !== 'owner') {
      yield* repo.setRole(canopy.id, owner.value.userId, 'owner')
    }
    const notification = yield* recordNotification(
      'canopy_member_left',
      owner.value.userId,
      { ...senderNameOf(leaver.name), canopyName: canopy.name },
      owner.value.language,
      {}
    )
    return LeaveOutcome.Left({ notification })
  })

const notifyLeave = (outcome: LeaveOutcome) =>
  outcome._tag === 'Left' ? dispatchNow(outcome.notification) : Effect.void

export const leaveCanopy = (
  userId: string
): Effect.Effect<LeaveOutcome, CanopyNotFoundError | SqlError, LeaveContext> =>
  Effect.gen(function* () {
    const outcome = yield* changeMember(userId)(
      ({
        locked,
      }): Effect.Effect<
        LeaveOutcome,
        CanopyNotFoundError | SqlError,
        LeaveContext
      > =>
        Option.match(locked, {
          onNone: () => Effect.fail(new CanopyNotFoundError()),
          onSome: (held) => leaveLocked(held, userId, 'return'),
        })
    )
    yield* notifyLeave(outcome)
    return outcome
  }).pipe(Effect.withSpan('leaveCanopy', { attributes: { 'user.id': userId } }))

export const leaveCanopyAndDelete =
  (userId: string) =>
  <A, E, R>(
    deletion: Effect.Effect<A, E, R>
  ): Effect.Effect<A, E | SqlError, R | LeaveContext> =>
    Effect.gen(function* () {
      const [outcome, result] = yield* changeMember(userId)(({ locked }) =>
        Effect.all([
          Option.match(locked, {
            onNone: () => Effect.succeed(Option.none<LeaveOutcome>()),
            onSome: (held) =>
              Effect.map(leaveLocked(held, userId, 'stay'), Option.some),
          }),
          deletion,
        ])
      )
      yield* Option.match(outcome, {
        onNone: () => Effect.void,
        onSome: notifyLeave,
      })
      return result
    }).pipe(
      Effect.withSpan('leaveCanopyAndDelete', {
        attributes: { 'user.id': userId },
      })
    )
