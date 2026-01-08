import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { chatMessages } from '@lily/db'
import type { ChatMessage } from '@lily/shared/ai-chat'
import { and, asc, eq } from 'drizzle-orm'
import { Context, Effect, Layer } from 'effect'

// Types for repository methods
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
    plantId: string,
    userId: string,
    limit?: number
  ) => Effect.Effect<ChatMessage[], SqlError>
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
      findByPlantId: (plantId: string, userId: string, limit?: number) =>
        Effect.gen(function* () {
          const query = db
            .select()
            .from(chatMessages)
            .where(
              and(
                eq(chatMessages.plantId, plantId),
                eq(chatMessages.userId, userId)
              )
            )
            .orderBy(asc(chatMessages.createdAt))

          const rows = limit ? yield* query.limit(limit) : yield* query

          return rows.map(mapToChatMessage)
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
