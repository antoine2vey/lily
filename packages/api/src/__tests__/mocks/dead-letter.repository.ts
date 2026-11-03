import {
  type CreateDeadLetterData,
  type DeadLetterMessage,
  DeadLetterRepository,
  type IDeadLetterRepository,
} from '@lily/api/repositories/dead-letter.repository'
import { Effect, Layer, Option } from 'effect'

export interface MockDeadLetterRepositoryOptions {
  onCreate?: (data: CreateDeadLetterData) => void
}

export const createMockDeadLetterRepository = (
  options: MockDeadLetterRepositoryOptions = {}
): Layer.Layer<DeadLetterRepository> => {
  const repo: IDeadLetterRepository = {
    create: (data) =>
      Effect.sync(() => {
        const message: DeadLetterMessage = {
          id: `dlq-${crypto.randomUUID()}`,
          originalMessageId: data.originalMessageId,
          topic: data.topic,
          payload: data.payload,
          error: data.error,
          retryCount: data.retryCount,
          createdAt: new Date(),
          failedAt: new Date(),
          userId: Option.getOrNull(Option.fromNullishOr(data.userId)),
          plantId: Option.getOrNull(Option.fromNullishOr(data.plantId)),
        }
        if (options.onCreate) {
          options.onCreate(data)
        }
        return message
      }),
  }

  return Layer.succeed(DeadLetterRepository, repo)
}

// Helper to get all messages created in the mock
export const createMockDeadLetterRepositoryWithCapture = () => {
  const capturedMessages: CreateDeadLetterData[] = []

  const layer = createMockDeadLetterRepository({
    onCreate: (data) => capturedMessages.push(data),
  })

  return { layer, capturedMessages }
}
