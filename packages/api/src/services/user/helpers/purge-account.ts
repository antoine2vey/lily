import { Absence } from '@lily/api/contexts/absence'
import { Canopy } from '@lily/api/contexts/canopy'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { Effect } from 'effect'

export const purgeAccount = (userId: string) =>
  Effect.gen(function* () {
    const canopy = yield* Canopy
    const absence = yield* Absence
    const userRepo = yield* UserRepository

    return yield* canopy.leaveForDeletion(userId)(
      Effect.andThen(
        absence.releaseForDeletion(userId),
        userRepo.delete(userId)
      )
    )
  }).pipe(
    Effect.withSpan('purgeAccount', { attributes: { 'user.id': userId } })
  )
