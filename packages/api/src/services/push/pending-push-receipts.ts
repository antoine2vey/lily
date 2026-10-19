import { RedisClient } from '@lily/api/services/message-queue/redis.provider'
import {
  Array,
  Context,
  Data,
  DateTime,
  Effect,
  Layer,
  Number,
  Option,
  pipe,
  Schema,
} from 'effect'
import type Redis from 'ioredis'

// An Expo ticket whose delivery receipt has not been read yet, kept with the
// token it was sent to because Expo receipts don't name the token.
export interface PendingReceipt {
  readonly ticketId: string
  readonly token: string
  readonly sentAt: DateTime.Utc
}

export class PendingPushReceiptsError extends Data.TaggedError(
  'PendingPushReceiptsError'
)<{ message: string; cause: unknown }> {}

export class PendingPushReceipts extends Context.Service<
  PendingPushReceipts,
  {
    readonly add: (
      receipts: ReadonlyArray<PendingReceipt>
    ) => Effect.Effect<void, PendingPushReceiptsError>
    // Oldest first, at most `limit`.
    readonly sentBefore: (
      cutoff: DateTime.Utc,
      limit: number
    ) => Effect.Effect<ReadonlyArray<PendingReceipt>, PendingPushReceiptsError>
    readonly remove: (
      receipts: ReadonlyArray<PendingReceipt>
    ) => Effect.Effect<void, PendingPushReceiptsError>
  }
>()('PendingPushReceipts') {
  static readonly layer = Layer.effect(
    PendingPushReceipts,
    Effect.gen(function* () {
      const redis = yield* RedisClient
      return makeRedisPendingPushReceipts(redis, 'lily:push:pending-receipts')
    })
  )
}

const Member = Schema.fromJsonString(
  Schema.Tuple([Schema.String, Schema.String])
)
const decodeMember = Schema.decodeUnknownOption(Member)
const encodeMember = (receipt: PendingReceipt) =>
  JSON.stringify([receipt.ticketId, receipt.token])

// One sorted set scored by send time (epoch ms). Each member is a
// `[ticketId, token]` JSON pair.
export const makeRedisPendingPushReceipts = (
  redis: Redis,
  key: string
): PendingPushReceipts['Service'] => {
  const run = <A>(message: string, op: () => Promise<A>) =>
    Effect.tryPromise({
      try: op,
      catch: (cause) => new PendingPushReceiptsError({ message, cause }),
    })

  return {
    add: (receipts) =>
      Array.match(receipts, {
        onEmpty: () => Effect.void,
        onNonEmpty: (all) =>
          run('Failed to record push tickets', () =>
            redis.zadd(
              key,
              ...Array.flatMap(all, (r) => [
                DateTime.toEpochMillis(r.sentAt),
                encodeMember(r),
              ])
            )
          ).pipe(Effect.asVoid),
      }),

    sentBefore: (cutoff, limit) =>
      run('Failed to read pending push receipts', () =>
        redis.zrangebyscore(
          key,
          '-inf',
          DateTime.toEpochMillis(cutoff),
          'WITHSCORES',
          'LIMIT',
          0,
          limit
        )
      ).pipe(
        Effect.map((flat) =>
          Array.getSomes(
            Array.map(Array.chunksOf(flat, 2), ([member, score]) =>
              pipe(
                Option.all({
                  pair: decodeMember(member),
                  sentAt: pipe(
                    Number.parse(String(score)),
                    Option.flatMap((ms) => DateTime.make(ms))
                  ),
                }),
                Option.map(
                  ({ pair: [ticketId, token], sentAt }): PendingReceipt => ({
                    ticketId,
                    token,
                    sentAt,
                  })
                )
              )
            )
          )
        )
      ),

    remove: (receipts) =>
      Array.match(receipts, {
        onEmpty: () => Effect.void,
        onNonEmpty: (all) =>
          run('Failed to remove pending push receipts', () =>
            redis.zrem(key, ...Array.map(all, encodeMember))
          ).pipe(Effect.asVoid),
      }),
  }
}
