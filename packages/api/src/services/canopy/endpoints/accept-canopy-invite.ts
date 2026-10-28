import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { canopyView } from '@lily/api/services/canopy/helpers/canopy-view'
import { findLiveInvite } from '@lily/api/services/canopy/helpers/invite-token'
import { failAlreadyInCanopy } from '@lily/api/services/canopy/helpers/membership'
import {
  notifyMemberBestEffort,
  senderNameOf,
} from '@lily/api/services/canopy/helpers/notify-member'
import { rebuildMemberReminders } from '@lily/api/services/plants/helpers/member-reminders'
import {
  CANOPY_MAX_MEMBERS,
  CanopyFullError,
  CanopyInviteNotFoundError,
} from '@lily/shared'
import { Effect, Option, pipe } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'

export const acceptCanopyInvite = Effect.fn('CanopyService.acceptCanopyInvite')(
  function* (token: string) {
    const { id: userId, name: joinerName } = yield* CurrentUser
    const repo = yield* CanopyRepository
    const sql = yield* SqlClient.SqlClient

    const joined = yield* sql.withTransaction(
      Effect.gen(function* () {
        const seen = yield* findLiveInvite(token)
        const canopy = yield* repo.lock(seen.canopyId)
        if (canopy === null) {
          return yield* new CanopyInviteNotFoundError()
        }
        yield* findLiveInvite(token)
        const current = yield* repo.findMembershipByUser(userId)
        if (current !== null) {
          if (current.canopyId !== canopy.id) {
            return yield* failAlreadyInCanopy(current.canopyId)
          }
          return { canopyId: canopy.id, notify: Option.none() }
        }

        const members = yield* repo.findMembersByJoinDate(canopy.id)
        if (members.length >= CANOPY_MAX_MEMBERS) {
          return yield* new CanopyFullError({ limit: CANOPY_MAX_MEMBERS })
        }
        if (!(yield* repo.addMember(canopy.id, userId, 'member'))) {
          const winner = yield* repo.findMembershipByUser(userId)
          return yield* failAlreadyInCanopy(
            pipe(
              Option.fromNullishOr(winner),
              Option.map((m) => m.canopyId),
              Option.getOrElse(() => canopy.id)
            )
          )
        }
        return {
          canopyId: canopy.id,
          notify: Option.some({ canopyName: canopy.name, members }),
        }
      })
    )

    yield* Option.match(joined.notify, {
      onNone: () => Effect.void,
      onSome: ({ canopyName, members }) =>
        Effect.andThen(
          rebuildMemberReminders(userId),
          Effect.forEach(members, (member) =>
            notifyMemberBestEffort('canopy_member_joined', member, {
              ...senderNameOf(joinerName),
              canopyName,
            })
          )
        ),
    })

    return yield* canopyView(joined.canopyId, userId)
  }
)
