import {
  type ChatConversationRow,
  ChatRepository,
  type FindChatHistoryParams,
  type IChatRepository,
  type ListConversationsParams,
  type SaveChatParams,
  type SavedChatMessage,
} from '@lily/api/repositories/chat.repository'
import { paginate } from '@lily/shared'
import type {
  ChatConversation,
  ChatConversationKind,
  ChatMessage,
} from '@lily/shared/ai-chat'
import type { UIMessage } from 'ai'
import { Array, Effect, Layer, Option, Order, pipe } from 'effect'

export interface MockChatRepositoryData {
  messages: ChatMessage[]
  conversations?: ChatConversation[]
}

const toRow = (msg: ChatMessage) => ({
  id: msg.id,
  messageId: null,
  role: msg.role,
  content: msg.content,
  parts: null,
  imageKey: null,
  userId: msg.userId,
  conversationId: msg.conversationId,
  createdAt: new Date(msg.createdAt),
})

const conversationToRow = (
  conversation: ChatConversation
): ChatConversationRow => ({
  id: conversation.id,
  userId: conversation.userId,
  kind: conversation.kind,
  plantId: conversation.plantId ?? null,
  title: conversation.title ?? null,
  createdAt: new Date(conversation.createdAt),
  lastMessageAt: new Date(conversation.lastMessageAt),
})

export const createMockChatRepository = (
  data: MockChatRepositoryData = { messages: [], conversations: [] }
): Layer.Layer<ChatRepository> => {
  const conversations: ChatConversation[] = data.conversations ?? []
  const ensureGet = (id: string): ChatConversation | undefined =>
    pipe(
      Array.findFirst(conversations, (c) => c.id === id),
      Option.getOrUndefined
    )

  const repo: IChatRepository = {
    findConversationById: (id) =>
      Effect.succeed(
        pipe(
          Array.findFirst(conversations, (c) => c.id === id),
          Option.map(conversationToRow),
          Option.getOrNull
        )
      ),

    findOrCreatePlantConversation: ({ userId, plantId }) => {
      const existing = pipe(
        Array.findFirst(
          conversations,
          (c) =>
            c.userId === userId && c.plantId === plantId && c.kind === 'plant'
        ),
        Option.getOrUndefined
      )
      if (existing) return Effect.succeed(existing)
      const created: ChatConversation = {
        id: `conv-${crypto.randomUUID()}`,
        userId,
        kind: 'plant',
        plantId,
        createdAt: new Date(),
        lastMessageAt: new Date(),
      }
      conversations.push(created)
      return Effect.succeed(created)
    },

    createGeneralConversation: ({ userId, title }) => {
      const created: ChatConversation = {
        id: `conv-${crypto.randomUUID()}`,
        userId,
        kind: 'general',
        ...(title !== undefined ? { title } : {}),
        createdAt: new Date(),
        lastMessageAt: new Date(),
      }
      conversations.push(created)
      return Effect.succeed(created)
    },

    listConversations: (params: ListConversationsParams) => {
      const filtered = Array.filter(
        conversations,
        (c) =>
          c.userId === params.userId &&
          (params.kind === undefined || c.kind === params.kind)
      )
      const byRecentDesc = Order.reverse(
        Order.mapInput(
          Order.Date,
          (c: ChatConversation) => new Date(c.lastMessageAt)
        )
      )
      const sorted = Array.sort(filtered, byRecentDesc)
      const page = pipe(
        Option.fromNullable(params.page),
        Option.getOrElse(() => 1)
      )
      const limit = pipe(
        Option.fromNullable(params.limit),
        Option.getOrElse(() => 20)
      )
      const offset = (page - 1) * limit
      const items = pipe(sorted, Array.drop(offset), Array.take(limit))
      return Effect.succeed(paginate(items, sorted.length, page, limit))
    },

    deleteConversation: ({ id, userId }) => {
      const idx = conversations.findIndex(
        (c) => c.id === id && c.userId === userId
      )
      if (idx >= 0) conversations.splice(idx, 1)
      data.messages = Array.filter(
        data.messages,
        (m) => m.conversationId !== id
      )
      return Effect.void
    },

    touchLastMessageAt: (id: string) => {
      const conv = ensureGet(id)
      if (conv) {
        const idx = conversations.findIndex((c) => c.id === id)
        if (idx >= 0)
          conversations[idx] = { ...conv, lastMessageAt: new Date() }
      }
      return Effect.void
    },

    updateConversationTitle: ({ id, title }) => {
      const idx = conversations.findIndex((c) => c.id === id)
      if (idx >= 0) {
        conversations[idx] = { ...conversations[idx]!, title }
      }
      return Effect.void
    },

    findById: (id) =>
      Effect.succeed(
        pipe(
          Array.findFirst(data.messages, (msg) => msg.id === id),
          Option.map(toRow),
          Option.getOrNull
        )
      ),

    findMessagesBefore: (params) => {
      const filtered = pipe(
        data.messages,
        Array.filter(
          (msg) =>
            msg.conversationId === params.conversationId &&
            new Date(msg.createdAt) < params.beforeDate
        ),
        Array.sort(
          Order.mapInput(
            Order.Date,
            (msg: ChatMessage) => new Date(msg.createdAt)
          )
        ),
        Array.map(toRow)
      )
      return Effect.succeed(filtered)
    },

    findByConversationId: (params: FindChatHistoryParams) => {
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
        (msg) => msg.conversationId === params.conversationId
      )
      const sorted = Array.sort(
        filtered,
        Order.mapInput(
          Order.Date,
          (msg: ChatMessage) => new Date(msg.createdAt)
        )
      )

      const total = Array.length(sorted)
      const items = pipe(sorted, Array.drop(offset), Array.take(limit))

      return Effect.succeed(paginate(items, total, page, limit))
    },

    getMessagesAsUIMessages: (conversationId: string) => {
      const filtered = Array.filter(
        data.messages,
        (msg) => msg.conversationId === conversationId
      )
      const sorted = Array.sort(
        filtered,
        Order.mapInput(
          Order.Date,
          (msg: ChatMessage) => new Date(msg.createdAt)
        )
      )
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
        conversationId: createData.conversationId,
        userId: createData.userId,
        createdAt: new Date(),
      }
      data.messages.push(newMessage)
      return Effect.succeed(newMessage)
    },

    saveChat: (params: SaveChatParams) => {
      const saved: SavedChatMessage[] = []

      Array.forEach(params.messages, (msg) => {
        const textContent = pipe(
          msg.parts,
          Array.filter((p) => p.type === 'text'),
          Array.map((p) => ('text' in p ? p.text : '')),
          Array.join('')
        )

        const existing = Array.findFirst(
          data.messages,
          (m) =>
            m.id === msg.id &&
            m.conversationId === params.conversationId &&
            m.userId === params.userId
        )

        if (Option.isNone(existing)) {
          const dbId = crypto.randomUUID()
          const newMessage: ChatMessage = {
            id: dbId,
            role: msg.role as 'user' | 'assistant',
            content: textContent,
            conversationId: params.conversationId,
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
  }

  return Layer.succeed(ChatRepository, repo)
}
