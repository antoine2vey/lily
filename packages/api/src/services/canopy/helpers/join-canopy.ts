import { Dirty, Reminders } from '@lily/api/contexts/reminders'
import { transact } from '@lily/api/kernel/transact'
import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { canopyView } from '@lily/api/services/canopy/helpers/canopy-view'
import { failAlreadyInCanopy } from '@lily/api/services/canopy/helpers/membership'
import { senderNameOf } from '@lily/api/services/canopy/helpers/notify-member'
import {
  dispatchAll,
  type RecordedNotification,
  recordNotification,
} from '@lily/api/services/helpers/schedule-notification'
import {
  CANOPY_MAX_MEMBERS,
  CanopyFullError,
  CanopyInviteNotFoundError,
} from '@lily/shared'
import { Array, Effect, Option, pipe } from 'effect'

export interface JoinTarget {
  readonly canopyId: string
  readonly readmitsOnly?: boolean
}

export interface JoinSource<E, R> {
  readonly findBeforeLock: Effect.Effect<JoinTarget, E, R>
  readonly findUnderLock: Effect.Effect<JoinTarget, E, R>
  readonly markUsed: Effect.Effect<void, E, R>
}

export interface Joiner {
  readonly id: string
  readonly name: string | null
}

export const joinCanopy = <E, R>(joiner: Joiner, source: JoinSource<E, R>) =>
  Effect.gen(function* () {
    const repo = yield* CanopyRepository

    const joined = yield* transact(
      Effect.gen(function* () {
        const seen = yield* source.findBeforeLock
        const canopy = yield* repo.lock(seen.canopyId)
        if (canopy === null) {
          return yield* new CanopyInviteNotFoundError()
        }
        const target = yield* source.findUnderLock
        const current = yield* repo.findMembershipByUser(joiner.id)
        if (current !== null) {
          if (current.canopyId !== canopy.id) {
            return yield* failAlreadyInCanopy(current.canopyId)
          }
          if (!target.readmitsOnly) yield* source.markUsed
          return {
            canopyId: canopy.id,
            notifications: Array.empty<RecordedNotification>(),
          }
        }
        if (target.readmitsOnly) {
          return yield* new CanopyInviteNotFoundError()
        }

        const members = yield* repo.findMembersByJoinDate(canopy.id)
        if (members.length >= CANOPY_MAX_MEMBERS) {
          return yield* new CanopyFullError({ limit: CANOPY_MAX_MEMBERS })
        }
        if (!(yield* repo.addMember(canopy.id, joiner.id, 'member'))) {
          const winner = yield* repo.findMembershipByUser(joiner.id)
          return yield* failAlreadyInCanopy(
            pipe(
              Option.fromNullishOr(winner),
              Option.map((m) => m.canopyId),
              Option.getOrElse(() => canopy.id)
            )
          )
        }
        yield* Reminders.request(Dirty.Recipient({ userId: joiner.id }))
        yield* source.markUsed
        const notifications = yield* Effect.forEach(members, (member) =>
          recordNotification(
            'canopy_member_joined',
            member.userId,
            { ...senderNameOf(joiner.name), canopyName: canopy.name },
            member.language,
            {}
          )
        )
        return { canopyId: canopy.id, notifications }
      })
    )

    yield* dispatchAll(joined.notifications)

    return yield* canopyView(joined.canopyId, joiner.id)
  })
