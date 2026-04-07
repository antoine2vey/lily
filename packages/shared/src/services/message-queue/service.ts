import type {
  NotificationTopic,
  QueueConnectionError,
  QueueMessage,
  QueueOperationError,
} from '@lily/shared/services/message-queue/types'
import { Context, type Effect } from 'effect'

// Provider-agnostic message queue interface
export interface IMessageQueue {
  readonly enqueue: (
    topic: NotificationTopic,
    message: QueueMessage
  ) => Effect.Effect<void, QueueOperationError | QueueConnectionError>

  readonly dequeue: (
    topic: NotificationTopic
  ) => Effect.Effect<
    { message: QueueMessage; rawData: string } | null,
    QueueOperationError | QueueConnectionError
  >

  readonly ack: (
    topic: NotificationTopic,
    rawData: string
  ) => Effect.Effect<void, QueueOperationError>

  readonly nack: (
    topic: NotificationTopic,
    rawData: string
  ) => Effect.Effect<void, QueueOperationError>
}

// Context tag for dependency injection
export class MessageQueue extends Context.Tag('MessageQueue')<
  MessageQueue,
  IMessageQueue
>() {}
