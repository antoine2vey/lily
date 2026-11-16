import { EventBus, publishWithRetry } from '@lily/api/events'
import { RareIdentificationRepository } from '@lily/api/repositories/rare-identification.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { Effect, Option, pipe, String } from 'effect'

const nonEmptyUrl = (imageUrl: string | undefined) =>
  pipe(Option.fromNullishOr(imageUrl), Option.filter(String.isNonEmpty))

export const rememberRareIdentification = (identification: {
  readonly isRareHouseplant: boolean
  readonly imageUrl: string
}) =>
  Effect.gen(function* () {
    const { id: userId } = yield* CurrentUser
    const repo = yield* RareIdentificationRepository

    yield* Option.match(nonEmptyUrl(identification.imageUrl), {
      onNone: () => Effect.void,
      onSome: (imageUrl) =>
        identification.isRareHouseplant
          ? repo.record({ userId, imageUrl })
          : Effect.void,
    })
  }).pipe(
    Effect.catchTag('SqlError', (error) =>
      Effect.logWarning(
        '[rare-identification] Remember failed after identify',
        {
          error,
        }
      )
    ),
    Effect.withSpan('PlantsService.rememberRareIdentification')
  )

export const awardRareIdentification = (
  plantId: string,
  imageUrl: string | undefined
) =>
  Effect.gen(function* () {
    const { id: userId } = yield* CurrentUser
    const repo = yield* RareIdentificationRepository
    const eventBus = yield* EventBus

    const rare = yield* Option.match(nonEmptyUrl(imageUrl), {
      onNone: () => Effect.succeed(false),
      onSome: (url) => repo.exists({ userId, imageUrl: url }),
    })

    if (rare) {
      yield* publishWithRetry(
        eventBus.publish({ _tag: 'RarePlantIdentified', userId, plantId })
      )
    }
  }).pipe(
    Effect.catchTag('SqlError', (error) =>
      Effect.logWarning('[rare-identification] Lookup failed after save', {
        plantId,
        error,
      })
    ),
    Effect.withSpan('PlantsService.awardRareIdentification')
  )
