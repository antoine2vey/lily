import {
  type CreateDeadLetterData,
  type DeadLetterMessage,
  DeadLetterRepository,
  type IDeadLetterRepository,
} from '@lily/api/repositories/dead-letter.repository'
import { Effect, Layer } from 'effect'

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
          userId: data.userId ?? null,
          plantId: data.plantId ?? null,
        }
        messages.push(message)
        options.onCreate?.(data)
        return message
      }),

    findByTopic: (topic) =>
      Effect.succeed(messages.filter((m) => m.topic === topic)),

    findAll: (limit = 100) => Effect.succeed(messages.slice(0, limit)),

    delete: (id) => {
      const idx = messages.findIndex((m) => m.id === id)
      if (idx === -1) return Effect.succeed(null)
      const [removed] = messages.splice(idx, 1)
      return Effect.succeed(removed ?? null)
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
