import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { activityPushTokens, deviceTokens } from '@lily/db/schema'
import { type ActivityPushToken, nowAsDate } from '@lily/shared'
import { and, eq, isNull, lt, ne, or, sql } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'

export interface UpsertStartTokenData {
  userId: string
  deviceTokenId: string
  token: string
}

export interface CreateActivityTokenData {
  userId: string
  deviceTokenId: string
  activityId: string
  token: string
  endsAt: Date
}

const mapRow = (
  row: typeof activityPushTokens.$inferSelect
): ActivityPushToken => ({
  id: row.id,
  userId: row.userId,
  deviceTokenId: row.deviceTokenId,
  kind: row.kind,
  activityId: row.activityId,
  token: row.token,
  status: row.status,
  startedAt: row.startedAt,
  endsAt: row.endsAt,
  lastConfirmedAt: row.lastConfirmedAt,
  lastFailedAt: row.lastFailedAt,
  updatedAt: row.updatedAt,
})

// INSERT ... RETURNING always yields a row in Postgres; a missing row is a
// framework bug, not a domain case. Die rather than leak `| null` upward.
const requireRow = (
  rows: ReadonlyArray<typeof activityPushTokens.$inferSelect>,
  op: string
): Effect.Effect<ActivityPushToken, never> =>
  pipe(
    Array.head(rows),
    Option.match({
      onNone: () =>
        Effect.die(
          new Error(`activityPushTokenRepository.${op}: INSERT returned no row`)
        ),
      onSome: (row) => Effect.succeed(mapRow(row)),
    })
  )

export interface IActivityPushTokenRepository {
  readonly findStartTokensByUserId: (
    userId: string
  ) => Effect.Effect<ActivityPushToken[], SqlError>
  readonly findActiveActivityByUserId: (
    userId: string
  ) => Effect.Effect<ActivityPushToken | null, SqlError>
  readonly findAllActiveUpdateTokens: () => Effect.Effect<
    ActivityPushToken[],
    SqlError
  >
  readonly findByActivityId: (
    activityId: string
  ) => Effect.Effect<ActivityPushToken | null, SqlError>
  readonly upsertStartToken: (
    data: UpsertStartTokenData
  ) => Effect.Effect<ActivityPushToken, SqlError>
  readonly createActivity: (
    data: CreateActivityTokenData
  ) => Effect.Effect<ActivityPushToken, SqlError>
  readonly markEnded: (
    activityId: string
  ) => Effect.Effect<ActivityPushToken | null, SqlError>
  readonly expireStaleOlderThan: (
    cutoff: Date
  ) => Effect.Effect<number, SqlError>
  readonly markStartTokenConfirmed: (
    userId: string,
    deviceTokenId: string
  ) => Effect.Effect<number, SqlError>
  readonly endOrphanStartTokens: (
    userId: string,
    keepDeviceTokenId: string
  ) => Effect.Effect<number, SqlError>
  readonly endStartTokenByDeviceTokenId: (
    deviceTokenId: string
  ) => Effect.Effect<number, SqlError>
  readonly expireUnconfirmedStartTokens: (params: {
    unconfirmedOlderThan: Date
    confirmedOlderThan: Date
  }) => Effect.Effect<number, SqlError>
}

export class ActivityPushTokenRepository extends Context.Tag(
  'ActivityPushTokenRepository'
)<ActivityPushTokenRepository, IActivityPushTokenRepository>() {}

export const ActivityPushTokenRepositoryLive = Layer.effect(
  ActivityPushTokenRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      findStartTokensByUserId: Effect.fn(
        'ActivityPushTokenRepository.findStartTokensByUserId'
      )(function* (userId: string) {
        const rows = yield* db
          .select()
          .from(activityPushTokens)
          .where(
            and(
              eq(activityPushTokens.userId, userId),
              eq(activityPushTokens.kind, 'start'),
              eq(activityPushTokens.status, 'active')
            )
          )
        return Array.map(rows, mapRow)
      }),

      findActiveActivityByUserId: Effect.fn(
        'ActivityPushTokenRepository.findActiveActivityByUserId'
      )(function* (userId: string) {
        const [row] = yield* db
          .select()
          .from(activityPushTokens)
          .where(
            and(
              eq(activityPushTokens.userId, userId),
              eq(activityPushTokens.kind, 'update'),
              eq(activityPushTokens.status, 'active')
            )
          )
          .limit(1)
        return row ? mapRow(row) : null
      }),

      // Reconciliation sweep — recovers activities left stuck after a dropped
      // CareLogCreated event.
      findAllActiveUpdateTokens: Effect.fn(
        'ActivityPushTokenRepository.findAllActiveUpdateTokens'
      )(function* () {
        const rows = yield* db
          .select()
          .from(activityPushTokens)
          .where(
            and(
              eq(activityPushTokens.kind, 'update'),
              eq(activityPushTokens.status, 'active')
            )
          )
        return Array.map(rows, mapRow)
      }),

      findByActivityId: Effect.fn(
        'ActivityPushTokenRepository.findByActivityId'
      )(function* (activityId: string) {
        const [row] = yield* db
          .select()
          .from(activityPushTokens)
          .where(eq(activityPushTokens.activityId, activityId))
          .limit(1)
        return row ? mapRow(row) : null
      }),

      // Apple rotates push-to-start tokens per device; upsert on
      // (deviceTokenId, kind) replaces the previous token.
      upsertStartToken: Effect.fn(
        'ActivityPushTokenRepository.upsertStartToken'
      )(function* (data: UpsertStartTokenData) {
        const rows = yield* db
          .insert(activityPushTokens)
          .values({
            userId: data.userId,
            deviceTokenId: data.deviceTokenId,
            kind: 'start',
            token: data.token,
            status: 'active',
          })
          .onConflictDoUpdate({
            target: [activityPushTokens.deviceTokenId, activityPushTokens.kind],
            set: {
              token: data.token,
              userId: data.userId,
              status: 'active',
              updatedAt: nowAsDate(),
            },
          })
          .returning()
        return yield* requireRow(rows, 'upsertStartToken')
      }),

      // A device has at most one UPDATE row (unique on device_token_id, kind);
      // starting a new activity replaces the previous one.
      createActivity: Effect.fn('ActivityPushTokenRepository.createActivity')(
        function* (data: CreateActivityTokenData) {
          const rows = yield* db
            .insert(activityPushTokens)
            .values({
              userId: data.userId,
              deviceTokenId: data.deviceTokenId,
              kind: 'update',
              activityId: data.activityId,
              token: data.token,
              status: 'active',
              endsAt: data.endsAt,
            })
            .onConflictDoUpdate({
              target: [
                activityPushTokens.deviceTokenId,
                activityPushTokens.kind,
              ],
              set: {
                userId: data.userId,
                activityId: data.activityId,
                token: data.token,
                status: 'active',
                endsAt: data.endsAt,
                updatedAt: nowAsDate(),
              },
            })
            .returning()
          return yield* requireRow(rows, 'createActivity')
        }
      ),

      markEnded: Effect.fn('ActivityPushTokenRepository.markEnded')(function* (
        activityId: string
      ) {
        const [row] = yield* db
          .update(activityPushTokens)
          .set({ status: 'ended' })
          .where(eq(activityPushTokens.activityId, activityId))
          .returning()
        return row ? mapRow(row) : null
      }),

      expireStaleOlderThan: Effect.fn(
        'ActivityPushTokenRepository.expireStaleOlderThan'
      )(function* (cutoff: Date) {
        const rows = yield* db
          .update(activityPushTokens)
          .set({ status: 'expired' })
          .where(
            and(
              eq(activityPushTokens.kind, 'update'),
              eq(activityPushTokens.status, 'active'),
              lt(activityPushTokens.startedAt, cutoff)
            )
          )
          .returning({ id: activityPushTokens.id })
        return Array.length(rows)
      }),

      // Ground truth: an `update` row arriving for a (userId, deviceTokenId)
      // pair proves the start-token for that pair successfully delivered to
      // the device. Stamp the start-row so the eviction sweep won't kill it.
      markStartTokenConfirmed: Effect.fn(
        'ActivityPushTokenRepository.markStartTokenConfirmed'
      )(function* (userId: string, deviceTokenId: string) {
        const rows = yield* db
          .update(activityPushTokens)
          .set({ lastConfirmedAt: nowAsDate(), updatedAt: nowAsDate() })
          .where(
            and(
              eq(activityPushTokens.userId, userId),
              eq(activityPushTokens.deviceTokenId, deviceTokenId),
              eq(activityPushTokens.kind, 'start')
            )
          )
          .returning({ id: activityPushTokens.id })
        return Array.length(rows)
      }),

      // Called when a fresh start-token registers. Marks any *other* start
      // rows for the same user as `ended`, but only if the underlying
      // device_token is no longer active — preserves multi-device users.
      endOrphanStartTokens: Effect.fn(
        'ActivityPushTokenRepository.endOrphanStartTokens'
      )(function* (userId: string, keepDeviceTokenId: string) {
        const rows = yield* db
          .update(activityPushTokens)
          .set({ status: 'ended', updatedAt: nowAsDate() })
          .where(
            and(
              eq(activityPushTokens.userId, userId),
              eq(activityPushTokens.kind, 'start'),
              eq(activityPushTokens.status, 'active'),
              ne(activityPushTokens.deviceTokenId, keepDeviceTokenId),
              sql`EXISTS (SELECT 1 FROM ${deviceTokens} dt WHERE dt.id = ${activityPushTokens.deviceTokenId} AND dt.is_active = false)`
            )
          )
          .returning({ id: activityPushTokens.id })
        return Array.length(rows)
      }),

      // Targeted invalidation: APNs returned BadDeviceToken/Unregistered for a
      // specific device's start-row, so mark it `ended`. The next registration
      // re-activates it with whatever token the device vends; for a genuinely
      // bad token (e.g. a dev-build sandbox token) it simply retries until the
      // device provides a valid one — harmless now that retiring no longer
      // touches `device_tokens.is_active` (see retire-start-token.ts).
      endStartTokenByDeviceTokenId: Effect.fn(
        'ActivityPushTokenRepository.endStartTokenByDeviceTokenId'
      )(function* (deviceTokenId: string) {
        const rows = yield* db
          .update(activityPushTokens)
          .set({ status: 'ended', updatedAt: nowAsDate() })
          .where(
            and(
              eq(activityPushTokens.deviceTokenId, deviceTokenId),
              eq(activityPushTokens.kind, 'start'),
              eq(activityPushTokens.status, 'active')
            )
          )
          .returning({ id: activityPushTokens.id })
        return Array.length(rows)
      }),

      // Background sweep: kills start-tokens that have never been confirmed
      // (likely never delivered to a device) past `unconfirmedOlderThan`, and
      // tokens not heard from in `confirmedOlderThan` (Apple has likely
      // rotated them since). Both bounds are caller-controlled.
      expireUnconfirmedStartTokens: Effect.fn(
        'ActivityPushTokenRepository.expireUnconfirmedStartTokens'
      )(function* (params: {
        unconfirmedOlderThan: Date
        confirmedOlderThan: Date
      }) {
        const rows = yield* db
          .update(activityPushTokens)
          .set({ status: 'expired', updatedAt: nowAsDate() })
          .where(
            and(
              eq(activityPushTokens.kind, 'start'),
              eq(activityPushTokens.status, 'active'),
              or(
                and(
                  isNull(activityPushTokens.lastConfirmedAt),
                  lt(activityPushTokens.startedAt, params.unconfirmedOlderThan)
                ),
                lt(
                  activityPushTokens.lastConfirmedAt,
                  params.confirmedOlderThan
                )
              )
            )
          )
          .returning({ id: activityPushTokens.id })
        return Array.length(rows)
      }),
    }
  })
)
