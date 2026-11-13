import {
  type RemindersConsumerContext,
  remindersConsumer,
} from '@lily/api/contexts/reminders'
import { eventBusForwarder } from '@lily/api/events/care-forwarder'
import { OutboxLive } from '@lily/api/kernel/outbox'
import { Effect, Layer } from 'effect'

export const AppOutboxLive = Layer.unwrap(
  Effect.gen(function* () {
    const context = yield* Effect.context<RemindersConsumerContext>()
    return OutboxLive([remindersConsumer(context), eventBusForwarder(context)])
  })
)
