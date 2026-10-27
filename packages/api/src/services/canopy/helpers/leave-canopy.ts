import {
  type CanopyMemberRow,
  CanopyRepository,
} from '@lily/api/repositories/canopy.repository'
import type { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import { dissolveCanopy } from '@lily/api/services/canopy/helpers/dissolve-canopy'
import {
  dropMember,
  lockMyCanopy,
} from '@lily/api/services/canopy/helpers/membership'
import { scheduleSimpleNotification } from '@lily/api/services/helpers/schedule-notification'
import { CanopyNotFoundError } from '@lily/shared'
import type { MessageQueue } from '@lily/shared/server'
import { Array, Data, Effect, Match, Option } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export type LeaveOutcome = Data.TaggedEnum<{
  NotMember: {}
  Left: {
    readonly canopyName: string
    readonly leaver: CanopyMemberRow
    readonly owner: Option.Option<CanopyMemberRow>
  }
  Dissolved: { readonly canopyId: string }
}>

export const LeaveOutcome = Data.taggedEnum<LeaveOutcome>()

/**
 * Ends the user's membership. An owner who leaves hands ownership to the
 * longest-standing member; the last member to leave dissolves the Canopy
 * into their own plants and rooms. The owner after the leave gets a
 * `canopy_member_left` push. A user in no Canopy is a no-op, so every
 * account-deletion path can run it.
 */
export const leaveCanopy = (
  userId: string
): Effect.Effect<
  LeaveOutcome,
  SqlError,
  | SqlClient.SqlClient
  | CanopyRepository
  | CareScheduleRepository
  | NotificationRepository
  | UserRepository
  | DelegationRepository
  | MessageQueue
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const outcome = yield* sql
      .withTransaction(
        Effect.gen(function* () {
          const repo = yield* CanopyRepository
          const { canopy, membership } = yield* lockMyCanopy(userId)
          const members = yield* repo.findMembers(canopy.id)
          const staying = Array.filter(members, (m) => m.userId !== userId)
          const leaver = yield* Option.match(
            Array.findFirst(members, (m) => m.userId === userId),
            {
              onNone: () => Effect.fail(new CanopyNotFoundError()),
              onSome: Effect.succeed,
            }
          )

          const heir = Array.head(staying)
          if (Option.isNone(heir)) {
            yield* dissolveCanopy(canopy.id, userId)
            return LeaveOutcome.Dissolved({ canopyId: canopy.id })
          }

          yield* dropMember(canopy.id, userId)
          if (membership.role === 'owner') {
            yield* repo.setRole(canopy.id, heir.value.userId, 'owner')
          }
          return LeaveOutcome.Left({
            canopyName: canopy.name,
            leaver,
            owner:
              membership.role === 'owner'
                ? heir
                : Array.findFirst(staying, (m) => m.role === 'owner'),
          })
        })
      )
      .pipe(
        Effect.catchTag('CanopyNotFoundError', () =>
          Effect.succeed(LeaveOutcome.NotMember())
        )
      )

    yield* Match.valueTags(outcome, {
      Left: ({ canopyName, leaver, owner }) =>
        Option.match(owner, {
          onNone: () => Effect.void,
          onSome: (to) =>
            scheduleSimpleNotification(
              'canopy_member_left',
              to.userId,
              {
                ...Option.match(Option.fromNullishOr(leaver.name), {
                  onNone: () => ({}),
                  onSome: (senderName) => ({ senderName }),
                }),
                canopyName,
              },
              to.language
            ),
        }),
      NotMember: () => Effect.void,
      Dissolved: () => Effect.void,
    })

    return outcome
  }).pipe(Effect.withSpan('leaveCanopy', { attributes: { 'user.id': userId } }))
