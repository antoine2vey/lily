import { Context, type Effect } from 'effect'
import type {
  NotificationTopic,
  QueueConnectionError,
  QueueMessage,
  QueueOperationError,
} from './types'

// Provider-agnostic message queue interface
export interface IMessageQueue {
  readonly enqueue: (
    topic: NotificationTopic,
    message: QueueMessage
  ) => Effect.Effect<void, QueueOperationError | QueueConnectionError>

  readonly dequeue: (
    topic: NotificationTopic
  ) => Effect.Effect<
    QueueMessage | null,
    QueueOperationError | QueueConnectionError
  >

  readonly ack: (
    topic: NotificationTopic,
    messageId: string
  ) => Effect.Effect<void, QueueOperationError>

  readonly nack: (
    topic: NotificationTopic,
    messageId: string
  ) => Effect.Effect<void, QueueOperationError>
}

// Context tag for dependency injection
export class MessageQueue extends Context.Tag('MessageQueue')<
  MessageQueue,
  IMessageQueue
>() {}
