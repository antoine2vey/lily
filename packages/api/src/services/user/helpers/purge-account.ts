import { Absence } from '@lily/api/contexts/absence'
import { Canopy } from '@lily/api/contexts/canopy'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { eraseAccountPhotos } from '@lily/api/services/user/helpers/erase-account-photos'
import { Effect } from 'effect'

export const purgeAccount = (userId: string) =>
  Effect.gen(function* () {
    const canopy = yield* Canopy
    const absence = yield* Absence
    const subscriptionRepo = yield* SubscriptionRepository
    const userRepo = yield* UserRepository

    return yield* canopy.leaveForDeletion(userId)(
      eraseAccountPhotos(userId).pipe(
        Effect.andThen(absence.releaseForDeletion(userId)),
        Effect.andThen(subscriptionRepo.deleteWebhookEvents(userId)),
        Effect.andThen(userRepo.delete(userId))
      )
    )
  }).pipe(
    Effect.withSpan('purgeAccount', { attributes: { 'user.id': userId } })
  )
