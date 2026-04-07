import {
  type IMessageQueue,
  MessageQueue,
  type NotificationTopic,
  type QueueMessage,
} from '@lily/shared/server'
import { Effect, Layer, Option, pipe } from 'effect'

export interface MockMessageQueueOptions {
  onEnqueue?: (topic: NotificationTopic, message: QueueMessage) => void
  onDequeue?: (
    topic: NotificationTopic
  ) => { message: QueueMessage; rawData: string } | null
  onAck?: (topic: NotificationTopic, rawData: string) => void
  onNack?: (topic: NotificationTopic, rawData: string) => void
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
      Effect.sync(() => {
        getQueue(topic).push(message)
        options.onEnqueue?.(topic, message)
      }),

    dequeue: (topic) =>
      Effect.sync(() => {
        if (options.onDequeue) {
          return options.onDequeue(topic)
        }
        const queue = getQueue(topic)
        const msg = pipe(Option.fromNullable(queue.shift()), Option.getOrNull)
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
        const msg = pipe(Option.fromNullable(queue.shift()), Option.getOrNull)
        if (!msg) return null
        return { message: msg, rawData: JSON.stringify(msg) }
      }),

    ack: (_topic, _rawData) => Effect.void,

    nack: (_topic, _rawData) => Effect.void,
  }

  return Layer.succeed(MessageQueue, service)
}
