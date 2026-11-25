import { Absence } from '@lily/api/contexts/absence'
import { Canopy } from '@lily/api/contexts/canopy'
import { DeadLetterRepository } from '@lily/api/repositories/dead-letter.repository'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { eraseAccountPhotos } from '@lily/api/services/user/helpers/erase-account-photos'
import { Effect, Option } from 'effect'

export const purgeAccount = (userId: string) =>
  Effect.gen(function* () {
    const canopy = yield* Canopy
    const absence = yield* Absence
    const deadLetterRepo = yield* DeadLetterRepository
    const subscriptionRepo = yield* SubscriptionRepository
    const userRepo = yield* UserRepository

    // Deleted after the user: a webhook that holds the account makes that
    // delete wait until its event commits, so this delete then sees the event.
    // They match the id as text, so they take it from the deleted row, which
    // Postgres answers in lowercase whatever case the caller gave.
    return yield* canopy.leaveForDeletion(userId)(
      eraseAccountPhotos(userId).pipe(
        Effect.andThen(absence.releaseForDeletion(userId)),
        Effect.andThen(userRepo.delete(userId)),
        Effect.tap((deleted) =>
          Option.match(Option.fromNullishOr(deleted), {
            onNone: () => Effect.void,
            onSome: ({ id }) =>
              Effect.andThen(
                subscriptionRepo.deleteWebhookEvents(id),
                deadLetterRepo.deleteNaming(id)
              ),
          })
        )
      )
    )
  }).pipe(
    Effect.withSpan('purgeAccount', { attributes: { 'user.id': userId } })
  )
