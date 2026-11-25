import { transitionEach } from '@lily/api/kernel/transition'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import { activityPushTokens, deviceTokens } from '@lily/db/schema'
import { type ActivityPushToken, nowAsDate } from '@lily/shared'
import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  sql,
} from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

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
  lastStartSentAt: row.lastStartSentAt,
  startActivityId: row.startActivityId,
  startConfirmedAt: row.startConfirmedAt,
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
  readonly findActiveActivitiesByUserId: (
    userId: string
  ) => Effect.Effect<ActivityPushToken[], SqlError>
  readonly findAllActiveUpdateTokens: Effect.Effect<
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
  /** Null when no live row has that activity: it ended or expired already. */
  readonly markEnded: (
    activityId: string
  ) => Effect.Effect<ActivityPushToken | null, SqlError>
  readonly expireStaleOlderThan: (
    cutoff: Date
  ) => Effect.Effect<number, SqlError>
  readonly markStartTokenConfirmed: (
    userId: string,
    deviceTokenId: string,
    startId: Option.Option<string>
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
  readonly claimStartTokens: (
    userId: string,
    deviceTokenIds: readonly string[],
    cutoff: Date,
    activityId: string
  ) => Effect.Effect<ReadonlyArray<string>, SqlError>
}

export class ActivityPushTokenRepository extends Context.Service<
  ActivityPushTokenRepository,
  IActivityPushTokenRepository
>()('ActivityPushTokenRepository') {}

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

      findActiveActivitiesByUserId: Effect.fn(
        'ActivityPushTokenRepository.findActiveActivitiesByUserId'
      )(function* (userId: string) {
        const rows = yield* db
          .select()
          .from(activityPushTokens)
          .where(
            and(
              eq(activityPushTokens.userId, userId),
              eq(activityPushTokens.kind, 'update'),
              eq(activityPushTokens.status, 'active')
            )
          )
        return Array.map(rows, mapRow)
      }),

      // Reconciliation sweep — recovers activities left stuck after a dropped
      // CareLogCreated event.
      findAllActiveUpdateTokens: Effect.gen(function* () {
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
      }).pipe(
        Effect.withSpan('ActivityPushTokenRepository.findAllActiveUpdateTokens')
      ),

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
      // starting a new activity replaces the previous one. The soft TTL reads
      // started_at as the age of the activity, so a new activity takes a new
      // one, and the same activity posting a rotated token keeps its own.
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
              startedAt: nowAsDate(),
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
                startedAt: sql`CASE WHEN ${activityPushTokens.activityId} IS DISTINCT FROM excluded.activity_id THEN excluded.started_at ELSE ${activityPushTokens.startedAt} END`,
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
        const [row] = yield* transitionEach(db, 'ActivityToken', {
          from: ['active'],
          to: 'ended',
          where: eq(activityPushTokens.activityId, activityId),
        })
        return row ? mapRow(row) : null
      }),

      expireStaleOlderThan: Effect.fn(
        'ActivityPushTokenRepository.expireStaleOlderThan'
      )(function* (cutoff: Date) {
        const rows = yield* transitionEach(db, 'ActivityToken', {
          from: ['active'],
          to: 'expired',
          where: and(
            eq(activityPushTokens.kind, 'update'),
            lt(activityPushTokens.startedAt, cutoff)
          ),
        })
        return Array.length(rows)
      }),

      // Ground truth: an `update` row arriving for a (userId, deviceTokenId)
      // pair proves the start-token for that pair successfully delivered to
      // the device. Stamp the start-row so the eviction sweep won't kill it.
      // A post that names a start confirms the last start only when it names
      // that one: the app re-posts every card on screen when it launches, old
      // ones too. A build that names none confirms the last start, as before
      // #367, so it keeps gap 2 of #367 until it updates.
      markStartTokenConfirmed: Effect.fn(
        'ActivityPushTokenRepository.markStartTokenConfirmed'
      )(function* (
        userId: string,
        deviceTokenId: string,
        startId: Option.Option<string>
      ) {
        const now = nowAsDate()
        const rows = yield* db
          .update(activityPushTokens)
          .set({
            lastConfirmedAt: now,
            startConfirmedAt: Option.match(startId, {
              onNone: () => now,
              onSome: (id) =>
                sql`CASE WHEN ${activityPushTokens.startActivityId} = ${id} THEN ${now.toISOString()}::timestamptz ELSE ${activityPushTokens.startConfirmedAt} END`,
            }),
            updatedAt: now,
          })
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
        const rows = yield* transitionEach(db, 'ActivityToken', {
          from: ['active'],
          to: 'ended',
          also: { updatedAt: nowAsDate() },
          where: and(
            eq(activityPushTokens.userId, userId),
            eq(activityPushTokens.kind, 'start'),
            ne(activityPushTokens.deviceTokenId, keepDeviceTokenId),
            sql`EXISTS (SELECT 1 FROM ${deviceTokens} dt WHERE dt.id = ${activityPushTokens.deviceTokenId} AND dt.is_active = false)`
          ),
        })
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
        const rows = yield* transitionEach(db, 'ActivityToken', {
          from: ['active'],
          to: 'ended',
          also: { updatedAt: nowAsDate() },
          where: and(
            eq(activityPushTokens.deviceTokenId, deviceTokenId),
            eq(activityPushTokens.kind, 'start')
          ),
        })
        return Array.length(rows)
      }),

      // Stamp the moment a push-to-start was dispatched to these devices, and
      // the activity id it carries. The stamp enforces the start cooldown (see
      // sendStarts in services/live-activity/cards.ts) and is written BEFORE
      // the APNs call, so a retry after a timeout cannot double-start.
      claimStartTokens: Effect.fn(
        'ActivityPushTokenRepository.claimStartTokens'
      )(function* (
        userId: string,
        deviceTokenIds: readonly string[],
        cutoff: Date,
        activityId: string
      ) {
        if (deviceTokenIds.length === 0) return []
        const rows = yield* db
          .update(activityPushTokens)
          .set({
            lastStartSentAt: nowAsDate(),
            startActivityId: activityId,
            startConfirmedAt: null,
            updatedAt: nowAsDate(),
          })
          .where(
            and(
              eq(activityPushTokens.userId, userId),
              eq(activityPushTokens.kind, 'start'),
              eq(activityPushTokens.status, 'active'),
              inArray(activityPushTokens.deviceTokenId, [...deviceTokenIds]),
              or(
                isNull(activityPushTokens.lastStartSentAt),
                lt(activityPushTokens.lastStartSentAt, cutoff),
                isNotNull(activityPushTokens.startConfirmedAt)
              )
            )
          )
          .returning({ deviceTokenId: activityPushTokens.deviceTokenId })
        return Array.map(rows, (row) => row.deviceTokenId)
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
        const rows = yield* transitionEach(db, 'ActivityToken', {
          from: ['active'],
          to: 'expired',
          also: { updatedAt: nowAsDate() },
          where: and(
            eq(activityPushTokens.kind, 'start'),
            or(
              and(
                isNull(activityPushTokens.lastConfirmedAt),
                lt(activityPushTokens.startedAt, params.unconfirmedOlderThan)
              ),
              lt(activityPushTokens.lastConfirmedAt, params.confirmedOlderThan)
            )
          ),
        })
        return Array.length(rows)
      }),
    }
  })
)
