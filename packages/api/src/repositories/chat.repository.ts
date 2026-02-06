import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import {
  extractCount,
  getPaginationParams,
} from '@lily/api/repositories/helpers/pagination'
import { chatMessages } from '@lily/db'
import { paginate } from '@lily/shared'
import type { ChatHistoryListResponse, ChatMessage } from '@lily/shared/ai-chat'
import type { UIMessage } from 'ai'
import { and, asc, count, eq } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'

// Types for repository methods
export interface FindChatHistoryParams {
  plantId: string
  userId: string
  page?: number
  limit?: number
}

export interface CreateChatMessageData {
  role: 'user' | 'assistant'
  content: string
  imageUrl?: string | undefined
  plantId: string
  userId: string
}

// Helper to map database row to API ChatMessage type (null -> undefined)
const mapToChatMessage = (
  row: typeof chatMessages.$inferSelect
): ChatMessage => ({
  id: row.id,
  role: row.role as 'user' | 'assistant',
  content: row.content,
  imageUrl: Option.getOrUndefined(Option.fromNullable(row.imageUrl)),
  plantId: row.plantId,
  userId: row.userId,
  createdAt: row.createdAt,
})

// Parameters for saving chat from streaming endpoint
export interface SaveChatParams {
  plantId: string
  userId: string
  messages: UIMessage[]
}

// Repository service interface
export interface IChatRepository {
  readonly findByPlantId: (
    params: FindChatHistoryParams
  ) => Effect.Effect<ChatHistoryListResponse, SqlError>
  readonly getMessagesAsUIMessages: (
    plantId: string,
    userId: string
  ) => Effect.Effect<UIMessage[], SqlError>
  readonly create: (
    data: CreateChatMessageData
  ) => Effect.Effect<ChatMessage | null, SqlError>
  readonly saveChat: (params: SaveChatParams) => Effect.Effect<void, SqlError>
  readonly deleteByPlantId: (
    plantId: string,
    userId: string
  ) => Effect.Effect<void, SqlError>
}

// Tag for dependency injection
export class ChatRepository extends Context.Tag('ChatRepository')<
  ChatRepository,
  IChatRepository
>() {}

// Live implementation using PgDrizzle
export const ChatRepositoryLive = Layer.effect(
  ChatRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      findByPlantId: (params: FindChatHistoryParams) =>
        Effect.gen(function* () {
          const { page, limit, offset } = getPaginationParams(params)

          const filterConditions = and(
            eq(chatMessages.plantId, params.plantId),
            eq(chatMessages.userId, params.userId)
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
        }),

      create: (data: CreateChatMessageData) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .insert(chatMessages)
            .values({
              role: data.role,
              content: data.content,
              imageUrl: Option.getOrNull(Option.fromNullable(data.imageUrl)),
              plantId: data.plantId,
              userId: data.userId,
            })
            .returning()
          return row ? mapToChatMessage(row) : null
        }),

      getMessagesAsUIMessages: (plantId: string, userId: string) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select()
            .from(chatMessages)
            .where(
              and(
                eq(chatMessages.plantId, plantId),
                eq(chatMessages.userId, userId)
              )
            )
            .orderBy(asc(chatMessages.createdAt))

          return Array.map(rows, (row): UIMessage => {
            // If parts are stored, use them; otherwise construct from content
            const parts = pipe(
              Option.fromNullable(row.parts as unknown),
              Option.filter((p): p is Array<{ type: string; text?: string }> =>
                globalThis.Array.isArray(p)
              ),
              Option.getOrElse(() => [
                { type: 'text' as const, text: row.content },
              ])
            )

            return {
              id: row.messageId ?? row.id,
              role: row.role as 'user' | 'assistant',
              parts: parts as UIMessage['parts'],
            }
          })
        }),

      saveChat: (params: SaveChatParams) =>
        Effect.gen(function* () {
          // Process each message, upserting by messageId
          yield* Effect.forEach(
            params.messages,
            (msg) =>
              Effect.gen(function* () {
                // Extract text content from parts for backwards compatibility
                const textContent = pipe(
                  msg.parts,
                  Array.filter((p) => p.type === 'text'),
                  Array.map((p) => ('text' in p ? p.text : '')),
                  Array.join('')
                )

                // Check if message exists by messageId
                const existing = yield* db
                  .select({ id: chatMessages.id })
                  .from(chatMessages)
                  .where(
                    and(
                      eq(chatMessages.messageId, msg.id),
                      eq(chatMessages.plantId, params.plantId),
                      eq(chatMessages.userId, params.userId)
                    )
                  )

                if (Array.isEmptyArray(existing)) {
                  // Insert new message
                  yield* db.insert(chatMessages).values({
                    messageId: msg.id,
                    role: msg.role,
                    content: textContent,
                    parts: msg.parts as unknown as Record<string, unknown>,
                    plantId: params.plantId,
                    userId: params.userId,
                  })
                }
                // If exists, skip (messages are immutable once created)
              }),
            { concurrency: 1 }
          )
        }),

      deleteByPlantId: (plantId: string, userId: string) =>
        Effect.gen(function* () {
          yield* db
            .delete(chatMessages)
            .where(
              and(
                eq(chatMessages.plantId, plantId),
                eq(chatMessages.userId, userId)
              )
            )
        }),
    }
  })
)
