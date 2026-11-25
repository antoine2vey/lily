import * as PgDrizzle from '@lily/db/effect-drizzle'
import {
  deadLetterMessages,
  ONE_DEAD_LETTER_PER_MESSAGE,
} from '@lily/db/schema'
import { nowAsDate } from '@lily/shared'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option } from 'effect'
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

/** The dead letter just written, or the one a message already had. */
export type AlertOwed =
  | { readonly id: string }
  | { readonly originalMessageId: string }

export interface IDeadLetterRepository {
  /** `null` when the message already has a dead letter. */
  readonly create: (
    data: CreateDeadLetterData
  ) => Effect.Effect<DeadLetterMessage | null, SqlError>
  /**
   * Records that the alert of a dead letter goes out, and returns that dead
   * letter. `null` when it has none or its alert is already recorded. Call it
   * in the transaction that alerts: a second caller waits on the row, and a
   * caller that stops before the commit leaves the alert to the next one.
   */
  readonly takeAlert: (
    owed: AlertOwed
  ) => Effect.Effect<DeadLetterMessage | null, SqlError>
  /**
   * Deletes every dead letter whose payload holds `userId` anywhere, for the
   * account purge. The poison path and the outbox store a payload that names
   * users without setting `user_id`, a raw entry is stored as text, and an
   * outbox event can name two users.
   */
  readonly deleteNaming: (userId: string) => Effect.Effect<void, SqlError>
}

export class DeadLetterRepository extends Context.Service<
  DeadLetterRepository,
  IDeadLetterRepository
>()('DeadLetterRepository') {}

export const DeadLetterRepositoryLive = Layer.effect(
  DeadLetterRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      create: Effect.fn('DeadLetterRepository.create')(function* (
        data: CreateDeadLetterData
      ) {
        const rows = yield* db
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
          .onConflictDoNothing({
            target: deadLetterMessages.originalMessageId,
            where: ONE_DEAD_LETTER_PER_MESSAGE,
          })
          .returning()
        return Option.getOrNull(
          Option.map(Array.head(rows), mapToDeadLetterMessage)
        )
      }),

      takeAlert: Effect.fn('DeadLetterRepository.takeAlert')(function* (
        owed: AlertOwed
      ) {
        const rows = yield* db
          .update(deadLetterMessages)
          .set({ alertedAt: nowAsDate() })
          .where(
            and(
              isNull(deadLetterMessages.alertedAt),
              'id' in owed
                ? eq(deadLetterMessages.id, owed.id)
                : and(
                    eq(
                      deadLetterMessages.originalMessageId,
                      owed.originalMessageId
                    ),
                    ONE_DEAD_LETTER_PER_MESSAGE
                  )
            )
          )
          .returning()
        return Option.getOrNull(
          Option.map(Array.head(rows), mapToDeadLetterMessage)
        )
      }),

      deleteNaming: Effect.fn('DeadLetterRepository.deleteNaming')(function* (
        userId: string
      ) {
        yield* db
          .delete(deadLetterMessages)
          .where(
            sql`strpos(${deadLetterMessages.payload}::text, ${userId}) > 0`
          )
      }),
    }
  })
)
