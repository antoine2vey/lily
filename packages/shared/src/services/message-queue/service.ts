import type {
  NotificationTopic,
  QueueConnectionError,
  QueueMessage,
  QueueMessageDecodeError,
  QueueOperationError,
} from '@lily/shared/services/message-queue/types'
import { Context, type Duration, type Effect } from 'effect'

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
    QueueOperationError | QueueConnectionError | QueueMessageDecodeError
  >

  readonly ack: (
    topic: NotificationTopic,
    rawData: string
  ) => Effect.Effect<void, QueueOperationError>

  readonly requeueStale: (
    topic: NotificationTopic,
    olderThan: Duration.Duration
  ) => Effect.Effect<number, QueueOperationError>
}

// Context tag for dependency injection
export class MessageQueue extends Context.Service<
  MessageQueue,
  IMessageQueue
>()('MessageQueue') {}
