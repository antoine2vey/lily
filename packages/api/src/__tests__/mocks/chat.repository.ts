import {
  ChatRepository,
  type FindChatHistoryParams,
  type IChatRepository,
  type SaveChatParams,
  type SavedChatMessage,
} from '@lily/api/repositories/chat.repository'
import { paginate } from '@lily/shared'
import type { ChatMessage } from '@lily/shared/ai-chat'
import type { UIMessage } from 'ai'
import { Array, Effect, Layer, Option, Order, pipe } from 'effect'

export interface MockChatRepositoryData {
  messages: ChatMessage[]
}

export const createMockChatRepository = (
  data: MockChatRepositoryData = { messages: [] }
): Layer.Layer<ChatRepository> => {
  const repo: IChatRepository = {
    findById: (id: string) => {
      const found = Array.findFirst(data.messages, (msg) => msg.id === id)
      return Effect.succeed(
        pipe(
          found,
          Option.map((msg) => ({
            id: msg.id,
            messageId: null,
            role: msg.role,
            content: msg.content,
            parts: null,
            imageKey: null,
            userId: msg.userId,
            plantId: msg.plantId,
            createdAt: new Date(msg.createdAt),
          })),
          Option.getOrNull
        )
      )
    },

    findMessagesBefore: (params: {
      plantId: string
      userId: string
      beforeDate: Date
    }) => {
      const filtered = pipe(
        data.messages,
        Array.filter(
          (msg) =>
            msg.plantId === params.plantId &&
            msg.userId === params.userId &&
            new Date(msg.createdAt) < params.beforeDate
        ),
        Array.sort(
          Order.mapInput(
            Order.Date,
            (msg: ChatMessage) => new Date(msg.createdAt)
          )
        ),
        Array.map((msg) => ({
          id: msg.id,
          messageId: null,
          role: msg.role,
          content: msg.content,
          parts: null,
          imageKey: null,
          userId: msg.userId,
          plantId: msg.plantId,
          createdAt: new Date(msg.createdAt),
        }))
      )
      return Effect.succeed(filtered)
    },

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
      const byCreatedAtAsc = Order.mapInput(
        Order.Date,
        (msg: ChatMessage) => new Date(msg.createdAt)
      )
      const sorted = Array.sort(filtered, byCreatedAtAsc)

      const total = Array.length(sorted)
      const items = pipe(sorted, Array.drop(offset), Array.take(limit))

      return Effect.succeed(paginate(items, total, page, limit))
    },

    getMessagesAsUIMessages: (plantId: string, userId: string) => {
      const filtered = Array.filter(
        data.messages,
        (msg) => msg.plantId === plantId && msg.userId === userId
      )

      // Sort by createdAt ascending (oldest first)
      const byCreatedAtAsc = Order.mapInput(
        Order.Date,
        (msg: ChatMessage) => new Date(msg.createdAt)
      )
      const sorted = Array.sort(filtered, byCreatedAtAsc)

      const uiMessages: UIMessage[] = Array.map(sorted, (msg) => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        parts: [{ type: 'text' as const, text: msg.content }],
      }))

      return Effect.succeed(uiMessages)
    },

    create: (createData) => {
      const newMessage: ChatMessage = {
        id: `msg-${crypto.randomUUID()}`,
        role: createData.role,
        content: createData.content,
        imageUrl: createData.imageKey,
        plantId: createData.plantId,
        userId: createData.userId,
        createdAt: new Date(),
      }
      data.messages.push(newMessage)
      return Effect.succeed(newMessage)
    },

    saveChat: (params: SaveChatParams) => {
      const saved: SavedChatMessage[] = []

      // Extract text content from parts and save as ChatMessage
      Array.forEach(params.messages, (msg) => {
        const textContent = pipe(
          msg.parts,
          Array.filter((p) => p.type === 'text'),
          Array.map((p) => ('text' in p ? p.text : '')),
          Array.join('')
        )

        // Check if message already exists
        const existing = Array.findFirst(
          data.messages,
          (m) =>
            m.id === msg.id &&
            m.plantId === params.plantId &&
            m.userId === params.userId
        )

        if (Option.isNone(existing)) {
          const dbId = crypto.randomUUID()
          const newMessage: ChatMessage = {
            id: dbId,
            role: msg.role as 'user' | 'assistant',
            content: textContent,
            plantId: params.plantId,
            userId: params.userId,
            createdAt: new Date(),
          }
          data.messages.push(newMessage)
          saved.push({ id: dbId, messageId: msg.id, role: msg.role })
        } else {
          const ex = Option.getOrThrow(existing)
          saved.push({ id: ex.id, messageId: msg.id, role: msg.role })
        }
      })

      return Effect.succeed(saved)
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
