import {
  type CreateDeadLetterData,
  type DeadLetterMessage,
  DeadLetterRepository,
  type IDeadLetterRepository,
} from '@lily/api/repositories/dead-letter.repository'
import { Array, Effect, Layer, Option } from 'effect'

export interface MockDeadLetterRepositoryOptions {
  onCreate?: (data: CreateDeadLetterData) => void
}

export const createMockDeadLetterRepository = (
  options: MockDeadLetterRepositoryOptions = {}
): Layer.Layer<DeadLetterRepository> => {
  const messages: DeadLetterMessage[] = []

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
          userId: Option.getOrNull(Option.fromNullable(data.userId)),
          plantId: Option.getOrNull(Option.fromNullable(data.plantId)),
        }
        messages.push(message)
        if (options.onCreate) {
          options.onCreate(data)
        }
        return message
      }),

    findByTopic: (topic) =>
      Effect.succeed(Array.filter(messages, (m) => m.topic === topic)),

    findAll: (limit = 100) => Effect.succeed(messages.slice(0, limit)),

    delete: (id) => {
      const idx = messages.findIndex((m) => m.id === id)
      if (idx === -1) return Effect.succeed(null)
      const [removed] = messages.splice(idx, 1)
      return Effect.succeed(Option.getOrNull(Option.fromNullable(removed)))
    },
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
