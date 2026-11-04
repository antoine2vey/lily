import type {
  QueueConnectionError,
  QueueMessage,
  QueueMessageDecodeError,
  QueueOperationError,
} from '@lily/shared/services/message-queue/types'
import { Context, type Duration, type Effect } from 'effect'

export interface IMessageQueue {
  readonly enqueue: (
    message: QueueMessage
  ) => Effect.Effect<void, QueueOperationError | QueueConnectionError>

  readonly dequeue: Effect.Effect<
    { message: QueueMessage; rawData: string } | null,
    QueueOperationError | QueueConnectionError | QueueMessageDecodeError
  >

  readonly ack: (rawData: string) => Effect.Effect<void, QueueOperationError>

  readonly requeueStale: (
    olderThan: Duration.Duration
  ) => Effect.Effect<number, QueueOperationError>

  readonly drainLegacyTopicLists: Effect.Effect<
    ReadonlyArray<string>,
    QueueOperationError
  >
}

// Context tag for dependency injection
export class MessageQueue extends Context.Service<
  MessageQueue,
  IMessageQueue
>()('MessageQueue') {}
