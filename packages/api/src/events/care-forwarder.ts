import { type CareEvent, CareTopic } from '@lily/api/contexts/care'
import { eventRetryPolicy } from '@lily/api/events/retry-policy'
import {
  type Consumer,
  ConsumerFailed,
  consumer,
} from '@lily/api/kernel/outbox'
import { type AppEvent, EventBus } from '@lily/shared/server'
import { type Context, Effect, Match } from 'effect'

const NAME = 'event-bus'

const asAppEvents = Match.type<CareEvent>().pipe(
  Match.tag(
    'CareRecorded',
    (event): ReadonlyArray<AppEvent> =>
      event.by === null
        ? []
        : [
            {
              _tag: 'CareLogCreated',
              userId: event.by,
              plantId: event.plantId,
              careLogId: event.careLogId,
              type: event.careType,
            },
            ...(event.answeredAttention
              ? [
                  {
                    _tag: 'AttentionResponded' as const,
                    userId: event.by,
                    plantId: event.plantId,
                  },
                ]
              : []),
          ]
  ),
  Match.orElse((): ReadonlyArray<AppEvent> => [])
)

export const eventBusForwarder = (
  context: Context.Context<EventBus>
): Consumer =>
  consumer(NAME, CareTopic, (event) =>
    Effect.gen(function* () {
      const eventBus = yield* EventBus
      yield* Effect.forEach(
        asAppEvents(event),
        (appEvent) =>
          eventBus.publish(appEvent).pipe(Effect.retry(eventRetryPolicy)),
        { discard: true }
      )
    }).pipe(
      Effect.provide(context),
      Effect.catchTag('EventBusPublishError', (error) =>
        Effect.fail(ConsumerFailed.because(NAME, error))
      )
    )
  )
