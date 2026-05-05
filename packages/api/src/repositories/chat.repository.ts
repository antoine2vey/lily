import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import {
  extractCount,
  getPaginationParams,
} from '@lily/api/repositories/helpers/pagination'
import { chatConversations, chatMessages } from '@lily/db/schema'
import { paginate } from '@lily/shared'
import type {
  ChatConversation,
  ChatConversationKind,
  ChatConversationListResponse,
  ChatHistoryListResponse,
  ChatMessage,
} from '@lily/shared/ai-chat'
import type { UIMessage } from 'ai'
import { and, asc, count, desc, eq, lt, sql } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'

// ── Types ──────────────────────────────────────────────────────────

export interface FindChatHistoryParams {
  conversationId: string
  page?: number
  limit?: number
}

export interface ListConversationsParams {
  userId: string
  kind?: ChatConversationKind
  page?: number
  limit?: number
}

export interface CreateChatMessageData {
  role: 'user' | 'assistant'
  content: string
  imageKey?: string | undefined
  conversationId: string
  userId: string
}

export interface SaveChatParams {
  conversationId: string
  userId: string
  messages: UIMessage[]
}

export interface SavedChatMessage {
  id: string
  messageId: string
  role: string
}

export type ChatMessageRow = typeof chatMessages.$inferSelect
export type ChatConversationRow = typeof chatConversations.$inferSelect

// ── Mappers ────────────────────────────────────────────────────────

const mapToChatMessage = (row: ChatMessageRow): ChatMessage => ({
  id: row.id,
  role: row.role as 'user' | 'assistant',
  content: row.content,
  imageUrl: Option.getOrUndefined(Option.fromNullable(row.imageKey)),
  parts: pipe(
    Option.fromNullable(row.parts),
    Option.filter((p): p is unknown[] => globalThis.Array.isArray(p)),
    Option.getOrUndefined
  ),
  conversationId: row.conversationId,
  userId: row.userId,
  createdAt: row.createdAt,
})

const mapToConversation = (row: ChatConversationRow): ChatConversation => ({
  id: row.id,
  userId: row.userId,
  kind: row.kind as ChatConversationKind,
  plantId: Option.getOrUndefined(Option.fromNullable(row.plantId)),
  title: Option.getOrUndefined(Option.fromNullable(row.title)),
  createdAt: row.createdAt,
  lastMessageAt: row.lastMessageAt,
})

// ── Service interface ──────────────────────────────────────────────

export interface IChatRepository {
  // Conversations
  readonly findConversationById: (
    id: string
  ) => Effect.Effect<ChatConversationRow | null, SqlError>
  readonly findOrCreatePlantConversation: (params: {
    userId: string
    plantId: string
  }) => Effect.Effect<ChatConversation, SqlError>
  readonly createGeneralConversation: (params: {
    userId: string
    title?: string | undefined
  }) => Effect.Effect<ChatConversation, SqlError>
  readonly listConversations: (
    params: ListConversationsParams
  ) => Effect.Effect<ChatConversationListResponse, SqlError>
  readonly deleteConversation: (params: {
    id: string
    userId: string
  }) => Effect.Effect<void, SqlError>
  readonly touchLastMessageAt: (id: string) => Effect.Effect<void, SqlError>
  readonly updateConversationTitle: (params: {
    id: string
    title: string
  }) => Effect.Effect<void, SqlError>

  // Messages
  readonly findById: (
    id: string
  ) => Effect.Effect<ChatMessageRow | null, SqlError>
  readonly findByConversationId: (
    params: FindChatHistoryParams
  ) => Effect.Effect<ChatHistoryListResponse, SqlError>
  readonly findMessagesBefore: (params: {
    conversationId: string
    beforeDate: Date
  }) => Effect.Effect<ChatMessageRow[], SqlError>
  readonly getMessagesAsUIMessages: (
    conversationId: string
  ) => Effect.Effect<UIMessage[], SqlError>
  readonly create: (
    data: CreateChatMessageData
  ) => Effect.Effect<ChatMessage | null, SqlError>
  readonly saveChat: (
    params: SaveChatParams
  ) => Effect.Effect<SavedChatMessage[], SqlError>
}

// ── Tag + Live ─────────────────────────────────────────────────────

export class ChatRepository extends Context.Tag('ChatRepository')<
  ChatRepository,
  IChatRepository
>() {}

export const ChatRepositoryLive = Layer.effect(
  ChatRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      findConversationById: Effect.fn('ChatRepository.findConversationById')(
        function* (id: string) {
          const [row] = yield* db
            .select()
            .from(chatConversations)
            .where(eq(chatConversations.id, id))
          return pipe(Option.fromNullable(row), Option.getOrNull)
        }
      ),

      findOrCreatePlantConversation: Effect.fn(
        'ChatRepository.findOrCreatePlantConversation'
      )(function* (params: { userId: string; plantId: string }) {
        const [existing] = yield* db
          .select()
          .from(chatConversations)
          .where(
            and(
              eq(chatConversations.userId, params.userId),
              eq(chatConversations.plantId, params.plantId),
              eq(chatConversations.kind, 'plant')
            )
          )
        if (existing) {
          return mapToConversation(existing)
        }
        const [created] = yield* db
          .insert(chatConversations)
          .values({
            userId: params.userId,
            kind: 'plant',
            plantId: params.plantId,
          })
          .returning()
        // The partial unique index guarantees insert succeeds when no row exists
        return mapToConversation(created!)
      }),

      createGeneralConversation: Effect.fn(
        'ChatRepository.createGeneralConversation'
      )(function* (params: { userId: string; title?: string | undefined }) {
        const [created] = yield* db
          .insert(chatConversations)
          .values({
            userId: params.userId,
            kind: 'general',
            title: Option.getOrNull(Option.fromNullable(params.title)),
          })
          .returning()
        return mapToConversation(created!)
      }),

      listConversations: Effect.fn('ChatRepository.listConversations')(
        function* (params: ListConversationsParams) {
          const { page, limit, offset } = getPaginationParams(params)
          const filterConditions = and(
            eq(chatConversations.userId, params.userId),
            ...(params.kind ? [eq(chatConversations.kind, params.kind)] : [])
          )

          const [countResult, rows] = yield* Effect.all(
            [
              db
                .select({ value: count() })
                .from(chatConversations)
                .where(filterConditions),
              db
                .select()
                .from(chatConversations)
                .where(filterConditions)
                .offset(offset)
                .limit(limit)
                .orderBy(desc(chatConversations.lastMessageAt)),
            ],
            { concurrency: 'unbounded' }
          )

          return paginate(
            Array.map(rows, mapToConversation),
            extractCount(countResult),
            page,
            limit
          )
        }
      ),

      deleteConversation: Effect.fn('ChatRepository.deleteConversation')(
        function* (params: { id: string; userId: string }) {
          yield* db
            .delete(chatConversations)
            .where(
              and(
                eq(chatConversations.id, params.id),
                eq(chatConversations.userId, params.userId)
              )
            )
        }
      ),

      touchLastMessageAt: Effect.fn('ChatRepository.touchLastMessageAt')(
        function* (id: string) {
          yield* db
            .update(chatConversations)
            .set({ lastMessageAt: sql`now()` })
            .where(eq(chatConversations.id, id))
        }
      ),

      updateConversationTitle: Effect.fn(
        'ChatRepository.updateConversationTitle'
      )(function* (params: { id: string; title: string }) {
        yield* db
          .update(chatConversations)
          .set({ title: params.title })
          .where(eq(chatConversations.id, params.id))
      }),

      findById: Effect.fn('ChatRepository.findById')(function* (id: string) {
        const [row] = yield* db
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.id, id))
        return pipe(Option.fromNullable(row), Option.getOrNull)
      }),

      findMessagesBefore: Effect.fn('ChatRepository.findMessagesBefore')(
        function* (params: { conversationId: string; beforeDate: Date }) {
          const rows = yield* db
            .select()
            .from(chatMessages)
            .where(
              and(
                eq(chatMessages.conversationId, params.conversationId),
                lt(chatMessages.createdAt, params.beforeDate)
              )
            )
            .orderBy(asc(chatMessages.createdAt))
          return rows
        }
      ),

      findByConversationId: Effect.fn('ChatRepository.findByConversationId')(
        function* (params: FindChatHistoryParams) {
          const { page, limit, offset } = getPaginationParams(params)
          const filterConditions = eq(
            chatMessages.conversationId,
            params.conversationId
          )

          const countResult = yield* db
            .select({ value: count() })
            .from(chatMessages)
            .where(filterConditions)
          const total = extractCount(countResult)

          const rows = yield* db
            .select()
            .from(chatMessages)
            .where(filterConditions)
            .offset(offset)
            .limit(limit)
            .orderBy(asc(chatMessages.createdAt))

          return paginate(Array.map(rows, mapToChatMessage), total, page, limit)
        }
      ),

      create: Effect.fn('ChatRepository.create')(function* (
        data: CreateChatMessageData
      ) {
        const [row] = yield* db
          .insert(chatMessages)
          .values({
            role: data.role,
            content: data.content,
            imageKey: Option.getOrNull(Option.fromNullable(data.imageKey)),
            conversationId: data.conversationId,
            userId: data.userId,
          })
          .returning()
        return row ? mapToChatMessage(row) : null
      }),

      getMessagesAsUIMessages: Effect.fn(
        'ChatRepository.getMessagesAsUIMessages'
      )(function* (conversationId: string) {
        const rows = yield* db
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.conversationId, conversationId))
          .orderBy(asc(chatMessages.createdAt))

        // Only text and file parts are safe for convertToModelMessages.
        // Tool UI parts (e.g. "tool-createDiagnosis") are for frontend
        // rendering only — the assistant text already captures tool output.
        const modelPartTypes = new Set(['text', 'file'])

        return Array.map(rows, (row): UIMessage => {
          const parts = pipe(
            Option.fromNullable(row.parts as unknown),
            Option.filter((p): p is Array<{ type: string; text?: string }> =>
              globalThis.Array.isArray(p)
            ),
            Option.map(Array.filter((p) => modelPartTypes.has(p.type))),
            Option.filter(Array.isNonEmptyArray),
            Option.getOrElse(() => [
              { type: 'text' as const, text: row.content },
            ])
          )

          return {
            id: pipe(
              Option.fromNullable(row.messageId),
              Option.getOrElse(() => row.id)
            ),
            role: row.role as 'user' | 'assistant',
            parts: parts as UIMessage['parts'],
          }
        })
      }),

      saveChat: Effect.fn('ChatRepository.saveChat')(function* (
        params: SaveChatParams
      ) {
        const saved = yield* Effect.forEach(
          params.messages,
          (msg) =>
            Effect.gen(function* () {
              const textContent = pipe(
                msg.parts,
                Array.filter((p) => p.type === 'text'),
                Array.map((p) => ('text' in p ? p.text : '')),
                Array.join('')
              )

              const existing = yield* db
                .select({ id: chatMessages.id })
                .from(chatMessages)
                .where(
                  and(
                    eq(chatMessages.messageId, msg.id),
                    eq(chatMessages.conversationId, params.conversationId),
                    eq(chatMessages.userId, params.userId)
                  )
                )

              if (Array.isEmptyArray(existing)) {
                const imageKey = pipe(
                  msg.parts,
                  Array.findFirst(
                    (
                      p
                    ): p is {
                      type: 'file'
                      mediaType: string
                      url: string
                    } =>
                      p.type === 'file' &&
                      'mediaType' in p &&
                      typeof (p as { mediaType?: string }).mediaType ===
                        'string' &&
                      (p as { mediaType: string }).mediaType.startsWith(
                        'image/'
                      )
                  ),
                  Option.map((p) => p.url),
                  Option.getOrUndefined
                )

                const [row] = yield* db
                  .insert(chatMessages)
                  .values({
                    messageId: msg.id,
                    role: msg.role,
                    content: textContent,
                    parts: msg.parts as unknown as Record<string, unknown>,
                    imageKey,
                    conversationId: params.conversationId,
                    userId: params.userId,
                  })
                  .returning({
                    id: chatMessages.id,
                    messageId: chatMessages.messageId,
                    role: chatMessages.role,
                  })

                return pipe(
                  Option.fromNullable(row),
                  Option.map((r) => ({
                    id: r.id,
                    messageId: pipe(
                      Option.fromNullable(r.messageId),
                      Option.getOrElse(() => msg.id)
                    ),
                    role: r.role,
                  }))
                )
              }

              return pipe(
                Array.head(existing),
                Option.map((row) => ({
                  id: row.id,
                  messageId: msg.id,
                  role: msg.role,
                }))
              )
            }),
          { concurrency: 1 }
        )

        return Array.getSomes(saved)
      }),
    }
  })
)
