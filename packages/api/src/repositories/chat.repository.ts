import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { chatMessages } from '@lily/db'
import { paginate } from '@lily/shared'
import type { ChatHistoryListResponse, ChatMessage } from '@lily/shared/ai-chat'
import { and, asc, count, eq } from 'drizzle-orm'
import { Context, Effect, Layer } from 'effect'

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
  imageUrl: row.imageUrl ?? undefined,
  plantId: row.plantId,
  userId: row.userId,
  createdAt: row.createdAt,
})

// Repository service interface
export interface IChatRepository {
  readonly findByPlantId: (
    params: FindChatHistoryParams
  ) => Effect.Effect<ChatHistoryListResponse, SqlError>
  readonly create: (
    data: CreateChatMessageData
  ) => Effect.Effect<ChatMessage | null, SqlError>
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
          const page = params.page ?? 1
          const limit = params.limit ?? 20
          const offset = (page - 1) * limit

          const filterConditions = and(
            eq(chatMessages.plantId, params.plantId),
            eq(chatMessages.userId, params.userId)
          )

          const countResult = yield* db
            .select({ value: count() })
            .from(chatMessages)
            .where(filterConditions)
          const total = countResult[0]?.value ?? 0

          const rows = yield* db
            .select()
            .from(chatMessages)
            .where(filterConditions)
            .offset(offset)
            .limit(limit)
            .orderBy(asc(chatMessages.createdAt))

          return paginate(rows.map(mapToChatMessage), total, page, limit)
        }),

      create: (data: CreateChatMessageData) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .insert(chatMessages)
            .values({
              role: data.role,
              content: data.content,
              imageUrl: data.imageUrl ?? null,
              plantId: data.plantId,
              userId: data.userId,
            })
            .returning()
          return row ? mapToChatMessage(row) : null
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
