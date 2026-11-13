import {
  type RemindersConsumerContext,
  remindersConsumer,
  replanConsumer,
} from '@lily/api/contexts/reminders'
import { eventBusForwarder } from '@lily/api/events/care-forwarder'
import { type Consumer, OutboxLive } from '@lily/api/kernel/outbox'
import { type Context, Effect, Layer } from 'effect'

export type AppConsumersContext = RemindersConsumerContext

/** Every consumer the application registers. Tests build their outbox from the same list. */
export const appConsumers = (
  context: Context.Context<AppConsumersContext>
): ReadonlyArray<Consumer> => [
  remindersConsumer(context),
  replanConsumer(context),
  eventBusForwarder(context),
]

export const AppOutboxLive = Layer.unwrap(
  Effect.gen(function* () {
    const context = yield* Effect.context<AppConsumersContext>()
    return OutboxLive(appConsumers(context))
  })
)
