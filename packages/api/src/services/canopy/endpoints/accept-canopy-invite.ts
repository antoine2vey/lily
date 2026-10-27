import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { canopyView } from '@lily/api/services/canopy/helpers/canopy-view'
import { findLiveInvite } from '@lily/api/services/canopy/helpers/invite-token'
import { failAlreadyInCanopy } from '@lily/api/services/canopy/helpers/membership'
import { scheduleSimpleNotification } from '@lily/api/services/helpers/schedule-notification'
import {
  CANOPY_MAX_MEMBERS,
  CanopyFullError,
  CanopyInviteNotFoundError,
} from '@lily/shared'
import { Effect, Option, pipe } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'

/**
 * Joins the invite's Canopy with no approval step. Accepting a link to the
 * Canopy the user is already in returns it unchanged; any other Canopy
 * answers `AlreadyInCanopyError` with its name. Every other member gets a
 * `canopy_member_joined` push.
 */
export const acceptCanopyInvite = Effect.fn('CanopyService.acceptCanopyInvite')(
  function* (token: string) {
    const { id: userId, name: joinerName } = yield* CurrentUser
    const repo = yield* CanopyRepository
    const sql = yield* SqlClient.SqlClient

    const joined = yield* sql.withTransaction(
      Effect.gen(function* () {
        const seen = yield* findLiveInvite(token)
        const current = yield* repo.findMembershipByUser(userId)
        if (current !== null) {
          if (current.canopyId !== seen.canopyId) {
            return yield* failAlreadyInCanopy(current.canopyId)
          }
          return { canopyId: current.canopyId, notify: Option.none() }
        }

        const canopy = yield* repo.lock(seen.canopyId)
        if (canopy === null) {
          return yield* new CanopyInviteNotFoundError()
        }
        // Read again under the lock: a revoke or a new link may have landed.
        yield* findLiveInvite(token)

        const members = yield* repo.findMembers(canopy.id)
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
        Effect.forEach(members, (member) =>
          scheduleSimpleNotification(
            'canopy_member_joined',
            member.userId,
            {
              ...Option.match(Option.fromNullishOr(joinerName), {
                onNone: () => ({}),
                onSome: (senderName) => ({ senderName }),
              }),
              canopyName,
            },
            member.language
          )
        ),
    })

    return yield* canopyView(joined.canopyId, userId)
  }
)
