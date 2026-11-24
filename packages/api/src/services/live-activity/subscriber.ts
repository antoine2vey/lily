import { Reminders } from '@lily/api/contexts/reminders'
import type { AppEvent } from '@lily/api/events'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { createSubscriber } from '@lily/api/services/helpers/create-subscriber'
import { syncCards } from '@lily/api/services/live-activity/cards'
import { Array, Effect, Match, Option, pipe } from 'effect'

const refreshCardsFor = (params: { actorId: string; plantId: string }) =>
  Effect.gen(function* () {
    const plantRepo = yield* PlantRepository
    const plant = Option.fromNullishOr(
      yield* plantRepo.findById(params.plantId)
    )
    const recipients = yield* Option.match(plant, {
      onNone: () => Effect.succeed<ReadonlyArray<string>>([]),
      onSome: Reminders.audienceOf,
    })
    const owner = pipe(
      plant,
      Option.flatMap((p) =>
        Match.value(p.owner).pipe(
          Match.tag('User', ({ userId }) => Option.some(userId)),
          Match.orElse(() => Option.none())
        )
      ),
      Option.toArray
    )
    yield* Effect.forEach(
      Array.dedupe([params.actorId, ...owner, ...recipients]),
      (userId) => syncCards(userId, 'update'),
      { discard: true }
    )
  })

// CareLogCreated and PlantLifecycleChanged are load-bearing for LA; other
// variants are no-ops.
export const processEvent = (event: AppEvent) =>
  Match.value(event).pipe(
    Match.tag('CareLogCreated', 'PlantLifecycleChanged', (e) =>
      refreshCardsFor({ actorId: e.userId, plantId: e.plantId })
    ),
    Match.orElse(() => Effect.void)
  )

export const startLiveActivitySubscriber = createSubscriber({
  name: 'live-activity',
  handle: processEvent,
})
