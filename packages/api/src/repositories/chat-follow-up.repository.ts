import {
  FollowUp,
  type FollowUpSet,
} from '@lily/api/services/ai-chat/follow-up-set'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import { chatFollowUpSets } from '@lily/db/schema'
import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, Schema } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

type FollowUpSetRow = typeof chatFollowUpSets.$inferSelect

const decodeFollowUps = Schema.decodeUnknownOption(Schema.Array(FollowUp))

const followUpsOrEmptyWhenOutdated = (json: unknown): ReadonlyArray<FollowUp> =>
  Option.getOrElse(decodeFollowUps(json), () => [])

const mapToFollowUpSet = (row: FollowUpSetRow): FollowUpSet => ({
  userId: row.userId,
  plantId: row.plantId,
  language: row.language,
  requestedAt: row.requestedAt,
  claimedUntil: row.claimedUntil,
  generatedAt: row.generatedAt,
  followUps: followUpsOrEmptyWhenOutdated(row.followUps),
})

export interface IChatFollowUpRepository {
  readonly findByUser: (
    userId: string
  ) => Effect.Effect<ReadonlyArray<FollowUpSet>, SqlError>
  readonly find: (
    userId: string,
    plantId: string
  ) => Effect.Effect<Option.Option<FollowUpSet>, SqlError>
  /**
   * Asks the worker for a new set of each plant. A set that is already
   * requested is left as it is. A request in another language than the stored
   * follow-ups empties them, because `language` describes both.
   */
  readonly request: (params: {
    readonly userId: string
    readonly plantIds: ReadonlyArray<string>
    readonly language: string
    readonly at: Date
  }) => Effect.Effect<void, SqlError>
  /**
   * Takes up to `limit` requested sets no worker holds, oldest request
   * first, and holds them until `until`.
   */
  readonly claim: (params: {
    readonly limit: number
    readonly at: Date
    readonly until: Date
  }) => Effect.Effect<ReadonlyArray<FollowUpSet>, SqlError>
  /** Replaces the follow-ups and closes the request. */
  readonly store: (params: {
    readonly userId: string
    readonly plantId: string
    readonly followUps: ReadonlyArray<FollowUp>
    readonly at: Date
  }) => Effect.Effect<void, SqlError>
  /** Closes the request and keeps the follow-ups the set already had. */
  readonly release: (params: {
    readonly userId: string
    readonly plantId: string
  }) => Effect.Effect<void, SqlError>
}

export class ChatFollowUpRepository extends Context.Service<
  ChatFollowUpRepository,
  IChatFollowUpRepository
>()('ChatFollowUpRepository') {}

export const ChatFollowUpRepositoryLive = Layer.effect(
  ChatFollowUpRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    const isSet = (userId: string, plantId: string) =>
      and(
        eq(chatFollowUpSets.userId, userId),
        eq(chatFollowUpSets.plantId, plantId)
      )

    return {
      findByUser: Effect.fn('ChatFollowUpRepository.findByUser')(function* (
        userId: string
      ) {
        const rows = yield* db
          .select()
          .from(chatFollowUpSets)
          .where(eq(chatFollowUpSets.userId, userId))
        return Array.map(rows, mapToFollowUpSet)
      }),

      find: Effect.fn('ChatFollowUpRepository.find')(function* (
        userId: string,
        plantId: string
      ) {
        const rows = yield* db
          .select()
          .from(chatFollowUpSets)
          .where(isSet(userId, plantId))
        return Option.map(Array.head(rows), mapToFollowUpSet)
      }),

      request: Effect.fn('ChatFollowUpRepository.request')(function* (params) {
        if (Array.isReadonlyArrayEmpty(params.plantIds)) return
        yield* db
          .insert(chatFollowUpSets)
          .values(
            Array.map(params.plantIds, (plantId) => ({
              userId: params.userId,
              plantId,
              language: params.language,
              requestedAt: params.at,
            }))
          )
          .onConflictDoUpdate({
            target: [chatFollowUpSets.userId, chatFollowUpSets.plantId],
            set: {
              requestedAt: sql`excluded.requested_at`,
              language: sql`excluded.language`,
              followUps: sql`CASE WHEN ${chatFollowUpSets.language} = excluded.language THEN ${chatFollowUpSets.followUps} ELSE '[]'::jsonb END`,
            },
            setWhere: isNull(chatFollowUpSets.requestedAt),
          })
      }),

      claim: Effect.fn('ChatFollowUpRepository.claim')(function* (params) {
        const requested = db
          .select({
            userId: chatFollowUpSets.userId,
            plantId: chatFollowUpSets.plantId,
          })
          .from(chatFollowUpSets)
          .where(
            and(
              isNotNull(chatFollowUpSets.requestedAt),
              or(
                isNull(chatFollowUpSets.claimedUntil),
                lt(chatFollowUpSets.claimedUntil, params.at)
              )
            )
          )
          .orderBy(asc(chatFollowUpSets.requestedAt))
          .limit(params.limit)
          .for('update', { skipLocked: true })
        const rows = yield* db
          .update(chatFollowUpSets)
          .set({ claimedUntil: params.until })
          .where(
            inArray(
              sql`(${chatFollowUpSets.userId}, ${chatFollowUpSets.plantId})`,
              requested
            )
          )
          .returning()
        return Array.map(rows, mapToFollowUpSet)
      }),

      store: Effect.fn('ChatFollowUpRepository.store')(function* (params) {
        yield* db
          .update(chatFollowUpSets)
          .set({
            followUps: params.followUps,
            generatedAt: params.at,
            requestedAt: null,
            claimedUntil: null,
          })
          .where(isSet(params.userId, params.plantId))
      }),

      release: Effect.fn('ChatFollowUpRepository.release')(function* (params) {
        yield* db
          .update(chatFollowUpSets)
          .set({ requestedAt: null, claimedUntil: null })
          .where(isSet(params.userId, params.plantId))
      }),
    }
  })
)
