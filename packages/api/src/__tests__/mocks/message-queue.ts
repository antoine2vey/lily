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
  onDequeue?: (
    topic: NotificationTopic
  ) => { message: QueueMessage; rawData: string } | null
  onAck?: (topic: NotificationTopic, rawData: string) => void
  onNack?: (topic: NotificationTopic, rawData: string) => void
  onRequeueStale?: (topic: NotificationTopic) => number
  enqueueFailure?: QueueOperationError | QueueConnectionError
}

export const createMockMessageQueue = (
  options: MockMessageQueueOptions = {}
): Layer.Layer<MessageQueue> => {
  // Internal queue state per topic
  const queues = new Map<NotificationTopic, QueueMessage[]>()

  const getQueue = (topic: NotificationTopic): QueueMessage[] => {
    const existing = queues.get(topic)
    if (existing) {
      return existing
    }
    const newQueue: QueueMessage[] = []
    queues.set(topic, newQueue)
    return newQueue
  }

  const service: IMessageQueue = {
    enqueue: (topic, message) =>
      Option.match(Option.fromNullishOr(options.enqueueFailure), {
        onNone: () =>
          Effect.sync(() => {
            getQueue(topic).push(message)
            options.onEnqueue?.(topic, message)
          }),
        onSome: (failure) => Effect.fail(failure),
      }),

    dequeue: (topic) =>
      Effect.sync(() => {
        if (options.onDequeue) {
          return options.onDequeue(topic)
        }
        const queue = getQueue(topic)
        const msg = pipe(Option.fromNullishOr(queue.shift()), Option.getOrNull)
        if (!msg) return null
        return { message: msg, rawData: JSON.stringify(msg) }
      }),

    ack: (topic, rawData) =>
      Effect.sync(() => {
        options.onAck?.(topic, rawData)
      }),

    nack: (topic, rawData) =>
      Effect.sync(() => {
        options.onNack?.(topic, rawData)
      }),

    requeueStale: (topic) =>
      Effect.sync(() => options.onRequeueStale?.(topic) ?? 0),
  }

  return Layer.succeed(MessageQueue, service)
}

// Helper to create a mock queue with pre-populated messages
export const createMockMessageQueueWithMessages = (
  messages: Map<NotificationTopic, QueueMessage[]>
): Layer.Layer<MessageQueue> => {
  // Clone messages to avoid mutation issues
  const queues = new Map<NotificationTopic, QueueMessage[]>()
  for (const [topic, msgs] of messages) {
    queues.set(topic, [...msgs])
  }

  const service: IMessageQueue = {
    enqueue: (topic, message) =>
      Effect.sync(() => {
        if (!queues.has(topic)) {
          queues.set(topic, [])
        }
        queues.get(topic)?.push(message)
      }),

    dequeue: (topic) =>
      Effect.sync(() => {
        const queue = queues.get(topic)
        if (!queue || queue.length === 0) return null
        const msg = pipe(Option.fromNullishOr(queue.shift()), Option.getOrNull)
        if (!msg) return null
        return { message: msg, rawData: JSON.stringify(msg) }
      }),

    ack: (_topic, _rawData) => Effect.void,

    nack: (_topic, _rawData) => Effect.void,

    requeueStale: (_topic, _olderThan) => Effect.succeed(0),
  }

  return Layer.succeed(MessageQueue, service)
}
