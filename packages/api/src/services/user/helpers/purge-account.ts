import { Absence } from '@lily/api/contexts/absence'
import { Canopy } from '@lily/api/contexts/canopy'
import { DeadLetterRepository } from '@lily/api/repositories/dead-letter.repository'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { eraseAccountPhotos } from '@lily/api/services/user/helpers/erase-account-photos'
import { Effect } from 'effect'

export const purgeAccount = (userId: string) =>
  Effect.gen(function* () {
    const canopy = yield* Canopy
    const absence = yield* Absence
    const deadLetterRepo = yield* DeadLetterRepository
    const subscriptionRepo = yield* SubscriptionRepository
    const userRepo = yield* UserRepository

    // Deleted after the user: a webhook that holds the account makes that
    // delete wait until its event commits, so this delete then sees the event.
    return yield* canopy.leaveForDeletion(userId)(
      eraseAccountPhotos(userId).pipe(
        Effect.andThen(absence.releaseForDeletion(userId)),
        Effect.andThen(userRepo.delete(userId)),
        Effect.tap(() =>
          Effect.andThen(
            subscriptionRepo.deleteWebhookEvents(userId),
            deadLetterRepo.deleteNaming(userId)
          )
        )
      )
    )
  }).pipe(
    Effect.withSpan('purgeAccount', { attributes: { 'user.id': userId } })
  )
