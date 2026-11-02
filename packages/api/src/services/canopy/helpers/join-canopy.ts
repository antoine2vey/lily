import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { canopyView } from '@lily/api/services/canopy/helpers/canopy-view'
import { failAlreadyInCanopy } from '@lily/api/services/canopy/helpers/membership'
import {
  notifyMemberBestEffort,
  senderNameOf,
} from '@lily/api/services/canopy/helpers/notify-member'
import { rebuildMemberReminders } from '@lily/api/services/plants/helpers/reconcile-reminders'
import {
  reminderKeysFor,
  withReminderKeys,
} from '@lily/api/services/plants/helpers/reminder-keys'
import {
  CANOPY_MAX_MEMBERS,
  CanopyFullError,
  CanopyInviteNotFoundError,
} from '@lily/shared'
import { Effect, Option, pipe } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'

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
    const sql = yield* SqlClient.SqlClient

    const joined = yield* sql.withTransaction(
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
          return { canopyId: canopy.id, notify: Option.none() }
        }
        if (target.readmitsOnly) {
          return yield* new CanopyInviteNotFoundError()
        }

        const members = yield* repo.findMembersByJoinDate(canopy.id)
        if (members.length >= CANOPY_MAX_MEMBERS) {
          return yield* new CanopyFullError({ limit: CANOPY_MAX_MEMBERS })
        }
        const plantIds = yield* repo.findPlantIdsOfCanopy(canopy.id)
        yield* withReminderKeys(reminderKeysFor(plantIds))(
          Effect.gen(function* () {
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
            yield* rebuildMemberReminders(joiner.id, plantIds)
          })
        )
        yield* source.markUsed
        return {
          canopyId: canopy.id,
          notify: Option.some({ canopyName: canopy.name, members }),
        }
      })
    )

    yield* Option.match(joined.notify, {
      onNone: () => Effect.void,
      onSome: ({ canopyName, members }) =>
        Effect.forEach(members, (member) =>
          notifyMemberBestEffort('canopy_member_joined', member, {
            ...senderNameOf(joiner.name),
            canopyName,
          })
        ),
    })

    return yield* canopyView(joined.canopyId, joiner.id)
  })
