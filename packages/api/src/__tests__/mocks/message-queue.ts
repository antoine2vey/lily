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
  onAck?: (claim: string) => void
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
      const dequeued = options.onDequeue
        ? options.onDequeue()
        : pipe(
            Option.fromNullishOr(queue.shift()),
            Option.map((message) => ({
              message,
              rawData: JSON.stringify(message),
            })),
            Option.getOrNull
          )
      return dequeued && { ...dequeued, claim: dequeued.rawData }
    }),

    ack: (claim) =>
      Effect.sync(() => {
        options.onAck?.(claim)
      }),

    refreshClaim: () => Effect.void,

    requeueStale: () => Effect.sync(() => options.onRequeueStale?.() ?? 0),

    drainLegacyTopicLists: Effect.sync(() => legacy.splice(0)),
  }

  return Layer.succeed(MessageQueue, service)
}
