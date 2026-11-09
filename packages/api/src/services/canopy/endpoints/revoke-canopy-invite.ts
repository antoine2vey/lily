import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { changeInvitations } from '@lily/api/services/plants/helpers/plant-change'
import { Effect } from 'effect'

export const revokeCanopyInvite = Effect.fn('CanopyService.revokeCanopyInvite')(
  function* () {
    const { id: userId } = yield* CurrentUser
    const repo = yield* CanopyRepository
    yield* changeInvitations(userId)(({ canopy }) =>
      repo.revokeInvite(canopy.id)
    )
  }
)
