import {
  type CanopyMemberRow,
  CanopyRepository,
} from '@lily/api/repositories/canopy.repository'
import type { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import type { PlantRepository } from '@lily/api/repositories/plant.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import { dissolveCanopy } from '@lily/api/services/canopy/helpers/dissolve-canopy'
import {
  dropMember,
  lockMyCanopy,
} from '@lily/api/services/canopy/helpers/membership'
import {
  notifyMemberBestEffort,
  senderNameOf,
} from '@lily/api/services/canopy/helpers/notify-member'
import type { CanopyNotFoundError } from '@lily/shared'
import type { MessageQueue } from '@lily/shared/server'
import { Array, Data, Effect, Option, pipe } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export type LeaveOutcome = Data.TaggedEnum<{
  Left: {
    readonly canopyName: string
    readonly leaver: CanopyMemberRow
    readonly owner: CanopyMemberRow
  }
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
  | MessageQueue

const leaveInTransaction = (
  userId: string
): Effect.Effect<LeaveOutcome, CanopyNotFoundError | SqlError, LeaveContext> =>
  Effect.gen(function* () {
    const repo = yield* CanopyRepository
    const { canopy } = yield* lockMyCanopy(userId)
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

    yield* dropMember(canopy.id, userId, owner.value.userId)
    yield* repo.revokeInviteCreatedBy(canopy.id, userId)
    if (owner.value.role !== 'owner') {
      yield* repo.setRole(canopy.id, owner.value.userId, 'owner')
    }
    return LeaveOutcome.Left({
      canopyName: canopy.name,
      leaver,
      owner: { ...owner.value, role: 'owner' },
    })
  })

const notifyLeave = (outcome: LeaveOutcome) =>
  outcome._tag === 'Left'
    ? notifyMemberBestEffort('canopy_member_left', outcome.owner, {
        ...senderNameOf(outcome.leaver.name),
        canopyName: outcome.canopyName,
      })
    : Effect.void

export const leaveCanopy = (
  userId: string
): Effect.Effect<LeaveOutcome, CanopyNotFoundError | SqlError, LeaveContext> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const outcome = yield* sql.withTransaction(leaveInTransaction(userId))
    yield* notifyLeave(outcome)
    return outcome
  }).pipe(Effect.withSpan('leaveCanopy', { attributes: { 'user.id': userId } }))

export const leaveCanopyAndDelete =
  (userId: string) =>
  <A, E, R>(
    deletion: Effect.Effect<A, E, R>
  ): Effect.Effect<A, E | SqlError, R | LeaveContext> =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const [outcome, result] = yield* sql.withTransaction(
        Effect.all([
          leaveInTransaction(userId).pipe(
            Effect.map(Option.some),
            Effect.catchTag('CanopyNotFoundError', () =>
              Effect.succeed(Option.none<LeaveOutcome>())
            )
          ),
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
