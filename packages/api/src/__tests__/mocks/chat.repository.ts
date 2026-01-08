import {
  ChatRepository,
  type IChatRepository,
} from '@lily/api/repositories/chat.repository'
import type { ChatMessage } from '@lily/shared/ai-chat'
import { Effect, Layer } from 'effect'

export interface MockChatRepositoryData {
  messages: ChatMessage[]
}

export const createMockChatRepository = (
  data: MockChatRepositoryData = { messages: [] }
): Layer.Layer<ChatRepository> => {
  const repo: IChatRepository = {
    findByPlantId: (plantId: string, userId: string, limit?: number) => {
      let filtered = data.messages.filter(
        (msg) => msg.plantId === plantId && msg.userId === userId
      )

      // Sort by createdAt ascending (oldest first)
      filtered.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )

      if (limit) {
        filtered = filtered.slice(0, limit)
      }

      return Effect.succeed(filtered)
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
      data.messages = data.messages.filter(
        (msg) => !(msg.plantId === plantId && msg.userId === userId)
      )
      return Effect.void
    },
  }

  return Layer.succeed(ChatRepository, repo)
}
