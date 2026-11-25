import {
  type CreateDeadLetterData,
  type DeadLetterMessage,
  DeadLetterRepository,
  type IDeadLetterRepository,
} from '@lily/api/repositories/dead-letter.repository'
import { UNKNOWN_MESSAGE_ID } from '@lily/db/schema'
import { Array, Effect, Layer, Option } from 'effect'

export interface MockDeadLetterRepositoryOptions {
  onCreate?: (data: CreateDeadLetterData) => void
}

export const createMockDeadLetterRepository = (
  options: MockDeadLetterRepositoryOptions = {}
): Layer.Layer<DeadLetterRepository> => {
  const unalerted = new Map<string, DeadLetterMessage>()
  const written = new Set<string>()
  const repo: IDeadLetterRepository = {
    create: (data) =>
      Effect.sync(() => {
        if (written.has(data.originalMessageId)) return null
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
        if (data.originalMessageId !== UNKNOWN_MESSAGE_ID) {
          written.add(data.originalMessageId)
        }
        unalerted.set(message.id, message)
        return message
      }),
    takeAlert: (owed) =>
      Effect.sync(() => {
        const taken = Array.findFirst(unalerted.values(), (message) =>
          'id' in owed
            ? message.id === owed.id
            : message.originalMessageId === owed.originalMessageId
        )
        return Option.getOrNull(
          Option.map(taken, (message) => {
            unalerted.delete(message.id)
            return message
          })
        )
      }),
    deleteNaming: () => Effect.void,
  }

  return Layer.succeed(DeadLetterRepository, repo)
}

export const createMockDeadLetterRepositoryWithCapture = () => {
  const capturedMessages: CreateDeadLetterData[] = []

  const layer = createMockDeadLetterRepository({
    onCreate: (data) => capturedMessages.push(data),
  })

  return { layer, capturedMessages }
}
