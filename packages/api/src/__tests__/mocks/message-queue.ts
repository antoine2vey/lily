import {
  type IMessageQueue,
  MessageQueue,
  type NotificationTopic,
  type QueueConnectionError,
  type QueueMessage,
  type QueueOperationError,
} from '@lily/shared/server'
import { Effect, Layer, Option, pipe } from 'effect'

export interface MockMessageQueueOptions {
  onEnqueue?: (topic: NotificationTopic, message: QueueMessage) => void
  onDequeue?: () => { message: QueueMessage; rawData: string } | null
  onAck?: (rawData: string) => void
  onRequeueStale?: () => number
  legacyEntries?: ReadonlyArray<string>
  enqueueFailure?: QueueOperationError | QueueConnectionError
}

export const createMockMessageQueue = (
  options: MockMessageQueueOptions = {}
): Layer.Layer<MessageQueue> => {
  const queue: QueueMessage[] = []
  const legacy = [...(options.legacyEntries ?? [])]

  const service: IMessageQueue = {
    enqueue: (message) =>
      Option.match(Option.fromNullishOr(options.enqueueFailure), {
        onNone: () =>
          Effect.sync(() => {
            queue.push(message)
            options.onEnqueue?.(message.topic, message)
          }),
        onSome: (failure) => Effect.fail(failure),
      }),

    dequeue: Effect.sync(() => {
      if (options.onDequeue) {
        return options.onDequeue()
      }
      const msg = pipe(Option.fromNullishOr(queue.shift()), Option.getOrNull)
      if (!msg) return null
      return { message: msg, rawData: JSON.stringify(msg) }
    }),

    ack: (rawData) =>
      Effect.sync(() => {
        options.onAck?.(rawData)
      }),

    requeueStale: () => Effect.sync(() => options.onRequeueStale?.() ?? 0),

    drainLegacyTopicLists: Effect.sync(() => legacy.splice(0)),
  }

  return Layer.succeed(MessageQueue, service)
}
