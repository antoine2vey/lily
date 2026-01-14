import {
  ChatRepository,
  type FindChatHistoryParams,
  type IChatRepository,
} from '@lily/api/repositories/chat.repository'
import { paginate } from '@lily/shared'
import type { ChatMessage } from '@lily/shared/ai-chat'
import { Array, Effect, Layer, Option, pipe } from 'effect'

export interface MockChatRepositoryData {
  messages: ChatMessage[]
}

export const createMockChatRepository = (
  data: MockChatRepositoryData = { messages: [] }
): Layer.Layer<ChatRepository> => {
  const repo: IChatRepository = {
    findByPlantId: (params: FindChatHistoryParams) => {
      const page = pipe(
        Option.fromNullable(params.page),
        Option.getOrElse(() => 1)
      )
      const limit = pipe(
        Option.fromNullable(params.limit),
        Option.getOrElse(() => 20)
      )
      const offset = (page - 1) * limit

      const filtered = Array.filter(
        data.messages,
        (msg) => msg.plantId === params.plantId && msg.userId === params.userId
      )

      // Sort by createdAt ascending (oldest first)
      const sorted = [...filtered].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )

      const total = sorted.length
      const items = sorted.slice(offset, offset + limit)

      return Effect.succeed(paginate(items, total, page, limit))
    },

    create: (createData) => {
      const newMessage: ChatMessage = {
        id: `msg-${crypto.randomUUID()}`,
        role: createData.role,
        content: createData.content,
        imageUrl: createData.imageUrl,
        plantId: createData.plantId,
        userId: createData.userId,
        createdAt: new Date(),
      }
      data.messages.push(newMessage)
      return Effect.succeed(newMessage)
    },

    deleteByPlantId: (plantId: string, userId: string) => {
      data.messages = Array.filter(
        data.messages,
        (msg) => !(msg.plantId === plantId && msg.userId === userId)
      )
      return Effect.void
    },
  }

  return Layer.succeed(ChatRepository, repo)
}
