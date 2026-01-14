import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { deadLetterMessages } from '@lily/db'
import { desc, eq } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option } from 'effect'

// Types for repository methods
export interface CreateDeadLetterData {
  originalMessageId: string
  topic: string
  payload: unknown
  error: string
  retryCount: number
  userId?: string
  plantId?: string
}

// Dead letter message type
export interface DeadLetterMessage {
  id: string
  originalMessageId: string
  topic: string
  payload: unknown
  error: string
  retryCount: number
  createdAt: Date
  failedAt: Date
  userId: string | null
  plantId: string | null
}

// Helper to map database row
const mapToDeadLetterMessage = (
  row: typeof deadLetterMessages.$inferSelect
): DeadLetterMessage => ({
  id: row.id,
  originalMessageId: row.originalMessageId,
  topic: row.topic,
  payload: row.payload,
  error: row.error,
  retryCount: row.retryCount,
  createdAt: row.createdAt,
  failedAt: row.failedAt,
  userId: row.userId,
  plantId: row.plantId,
})

// Repository service interface
export interface IDeadLetterRepository {
  readonly create: (
    data: CreateDeadLetterData
  ) => Effect.Effect<DeadLetterMessage | null, SqlError>
  readonly findByTopic: (
    topic: string
  ) => Effect.Effect<DeadLetterMessage[], SqlError>
  readonly findAll: (
    limit?: number
  ) => Effect.Effect<DeadLetterMessage[], SqlError>
  readonly delete: (
    id: string
  ) => Effect.Effect<DeadLetterMessage | null, SqlError>
}

// Tag for dependency injection
export class DeadLetterRepository extends Context.Tag('DeadLetterRepository')<
  DeadLetterRepository,
  IDeadLetterRepository
>() {}

// Live implementation using PgDrizzle
export const DeadLetterRepositoryLive = Layer.effect(
  DeadLetterRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      create: (data: CreateDeadLetterData) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .insert(deadLetterMessages)
            .values({
              originalMessageId: data.originalMessageId,
              topic: data.topic,
              payload: data.payload,
              error: data.error,
              retryCount: data.retryCount,
              userId: Option.getOrNull(Option.fromNullable(data.userId)),
              plantId: Option.getOrNull(Option.fromNullable(data.plantId)),
            })
            .returning()
          return row ? mapToDeadLetterMessage(row) : null
        }),

      findByTopic: (topic: string) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select()
            .from(deadLetterMessages)
            .where(eq(deadLetterMessages.topic, topic))
            .orderBy(desc(deadLetterMessages.failedAt))
          return Array.map(rows, mapToDeadLetterMessage)
        }),

      findAll: (limit = 100) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select()
            .from(deadLetterMessages)
            .orderBy(desc(deadLetterMessages.failedAt))
            .limit(limit)
          return Array.map(rows, mapToDeadLetterMessage)
        }),

      delete: (id: string) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .delete(deadLetterMessages)
            .where(eq(deadLetterMessages.id, id))
            .returning()
          return row ? mapToDeadLetterMessage(row) : null
        }),
    }
  })
)
