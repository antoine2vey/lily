import {
  type IMessageQueue,
  MessageQueue,
  type NotificationTopic,
  type QueueMessage,
} from '@lily/shared'
import { Effect, Layer } from 'effect'

export interface MockMessageQueueOptions {
  onEnqueue?: (topic: NotificationTopic, message: QueueMessage) => void
  onDequeue?: (topic: NotificationTopic) => QueueMessage | null
  onAck?: (topic: NotificationTopic, messageId: string) => void
  onNack?: (topic: NotificationTopic, messageId: string) => void
}

export const createMockMessageQueue = (
  options: MockMessageQueueOptions = {}
): Layer.Layer<MessageQueue> => {
  // Internal queue state per topic
  const queues = new Map<NotificationTopic, QueueMessage[]>()

  const getQueue = (topic: NotificationTopic): QueueMessage[] => {
    if (!queues.has(topic)) {
      queues.set(topic, [])
    }
    return queues.get(topic)!
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
        return queue.shift() ?? null
      }),

    ack: (topic, messageId) =>
      Effect.sync(() => {
        options.onAck?.(topic, messageId)
      }),

    nack: (topic, messageId) =>
      Effect.sync(() => {
        options.onNack?.(topic, messageId)
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
        queues.get(topic)!.push(message)
      }),

    dequeue: (topic) =>
      Effect.sync(() => {
        const queue = queues.get(topic)
        if (!queue || queue.length === 0) return null
        return queue.shift() ?? null
      }),

    ack: (_topic, _messageId) => Effect.void,

    nack: (_topic, _messageId) => Effect.void,
  }

  return Layer.succeed(MessageQueue, service)
}
