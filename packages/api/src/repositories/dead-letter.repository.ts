import * as PgDrizzle from '@lily/db/effect-drizzle'
import { deadLetterMessages } from '@lily/db/schema'
import { Context, Effect, Layer, Option } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

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
}

export class DeadLetterRepository extends Context.Service<
  DeadLetterRepository,
  IDeadLetterRepository
>()('DeadLetterRepository') {}

// Live implementation using PgDrizzle
export const DeadLetterRepositoryLive = Layer.effect(
  DeadLetterRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      create: Effect.fn('DeadLetterRepository.create')(function* (
        data: CreateDeadLetterData
      ) {
        const [row] = yield* db
          .insert(deadLetterMessages)
          .values({
            originalMessageId: data.originalMessageId,
            topic: data.topic,
            payload: data.payload,
            error: data.error,
            retryCount: data.retryCount,
            userId: Option.getOrNull(Option.fromNullishOr(data.userId)),
            plantId: Option.getOrNull(Option.fromNullishOr(data.plantId)),
          })
          .returning()
        return row ? mapToDeadLetterMessage(row) : null
      }),
    }
  })
)
