import {
  type CanopyInvitationRow,
  CanopyRepository,
} from '@lily/api/repositories/canopy.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { admissionOf } from '@lily/api/services/canopy/helpers/invitation'
import {
  type JoinTarget,
  joinCanopy,
} from '@lily/api/services/canopy/helpers/join-canopy'
import {
  CanopyInviteExpiredError,
  CanopyInviteNotFoundError,
} from '@lily/shared'
import { DateTime, Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

const admit = (
  read: Effect.Effect<CanopyInvitationRow | null, SqlError>,
  inviteeId: string
): Effect.Effect<
  JoinTarget,
  CanopyInviteNotFoundError | CanopyInviteExpiredError | SqlError
> =>
  Effect.gen(function* () {
    const invitation = yield* read
    if (invitation === null || invitation.inviteeUserId !== inviteeId) {
      return yield* new CanopyInviteNotFoundError()
    }
    const admission = admissionOf(invitation, DateTime.nowUnsafe())
    if (admission === 'gone') return yield* new CanopyInviteNotFoundError()
    if (admission === 'expired') return yield* new CanopyInviteExpiredError()
    return {
      canopyId: invitation.canopyId,
      readmitsOnly: admission === 'spent',
    }
  })

export const acceptCanopyInvitation = Effect.fn(
  'CanopyService.acceptCanopyInvitation'
)(function* (invitationId: string) {
  const { id, name } = yield* CurrentUser
  const repo = yield* CanopyRepository
  return yield* joinCanopy(
    { id, name },
    {
      findBeforeLock: admit(repo.findInvitation(invitationId), id),
      findUnderLock: admit(repo.lockInvitation(invitationId), id),
      markUsed: Effect.flatMap(
        repo.transitionInvitation(invitationId, 'pending', 'accepted'),
        (accepted) =>
          accepted === null
            ? Effect.fail(new CanopyInviteNotFoundError())
            : Effect.void
      ),
    }
  )
})
