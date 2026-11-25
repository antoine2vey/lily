import {
  sessionsWaitingForALock,
  waitsForALock,
} from '@lily/api/__tests__/integration/lock-waits'
import { createMockRevenueCatProvider } from '@lily/api/__tests__/mocks/revenuecat.provider'
import { SubscriptionRepositoryLive } from '@lily/api/repositories/subscription.repository'
import { handleRevenueCatWebhook } from '@lily/api/services/subscriptions/endpoints/webhook/handle-revenuecat-webhook'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import type {
  RevenueCatEventType,
  RevenueCatSubscriberInfo,
} from '@lily/shared'
import { eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, ConfigProvider, Deferred, Effect, Layer } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

// The advisory keyspace the pause trigger waits in. No kernel lock uses it.
const PAUSE_KEYSPACE = 390_390

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000)

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'RevenueCat sync order - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    const userIds: string[] = []

    const RepoLive = SubscriptionRepositoryLive.pipe(
      Layer.provideMerge(DrizzleLive),
      Layer.provideMerge(PgLive),
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            DATABASE_URL: process.env.DATABASE_URL_TEST,
          })
        )
      )
    )

    const subscriber = (
      userId: string,
      expires: Date
    ): RevenueCatSubscriberInfo => ({
      subscriber: {
        original_app_user_id: userId,
        subscriptions: {
          lily_monthly: {
            expires_date: expires.toISOString(),
            purchase_date: inDays(-31).toISOString(),
            store: 'app_store',
            is_sandbox: false,
            unsubscribe_detected_at: null,
            billing_issues_detected_at: null,
            period_type: 'normal',
          },
        },
      },
    })

    const deliver = (
      type: RevenueCatEventType,
      userId: string,
      subscriberInfo: Effect.Effect<RevenueCatSubscriberInfo>
    ) =>
      Effect.runPromiseExit(
        handleRevenueCatWebhook(
          JSON.stringify({
            api_version: '1.0',
            event: {
              type,
              id: `${type}-${userId}`,
              app_user_id: userId,
              original_app_user_id: userId,
              product_id: 'lily_monthly',
              store: 'APP_STORE',
              environment: 'PRODUCTION',
              original_transaction_id: 'txn-1',
            },
          }),
          'Bearer test'
        ).pipe(
          Effect.provide(
            Layer.merge(
              RepoLive,
              createMockRevenueCatProvider({
                getSubscriberInfo: () => subscriberInfo,
              })
            )
          )
        )
      )

    const aUser = async () => {
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `revenuecat-sync-${crypto.randomUUID()}@example.com`,
          name: `revenuecat_sync_${crypto.randomUUID()}`,
          emailVerified: true,
          role: 'user',
          status: 'active',
        })
        .returning()
      userIds.push(user!.id)
      return user!.id
    }

    const statusOf = async (userId: string) =>
      Array.map(
        await db
          .select({ status: schema.userSubscriptions.status })
          .from(schema.userSubscriptions)
          .where(eq(schema.userSubscriptions.userId, userId)),
        (row) => row.status
      )

    /** A fetch that has read `info` from the store and answers once `released`. */
    const heldFetch = (info: RevenueCatSubscriberInfo) => {
      const reading = Deferred.makeUnsafe<void>()
      const released = Deferred.makeUnsafe<void>()
      return {
        reading: Effect.runPromise(Deferred.await(reading)),
        release: () => Effect.runPromise(Deferred.succeed(released, undefined)),
        fetch: Deferred.succeed(reading, undefined).pipe(
          Effect.andThen(Deferred.await(released)),
          Effect.as(info)
        ),
      }
    }

    beforeAll(() => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    afterAll(async () => {
      await db
        .delete(schema.revenuecatWebhookEvents)
        .where(inArray(schema.revenuecatWebhookEvents.appUserId, userIds))
      await db.delete(schema.users).where(inArray(schema.users.id, userIds))
      await pool.end()
    })

    it('ends on the state fetched last when an earlier fetch answers after a later delivery', async () => {
      const userId = await aUser()
      const older = heldFetch(subscriber(userId, inDays(30)))

      const renewal = deliver('RENEWAL', userId, older.fetch)
      await older.reading
      const expiration = deliver(
        'EXPIRATION',
        userId,
        Effect.sync(() => subscriber(userId, inDays(-1)))
      )
      await waitsForALock(pool, expiration)
      await older.release()

      expect((await renewal)._tag).toBe('Success')
      expect((await expiration)._tag).toBe('Success')
      expect(await statusOf(userId)).toEqual(['expired'])
    })

    it('lets another user sync while a fetch is still out', async () => {
      const slowUser = await aUser()
      const otherUser = await aUser()
      const slow = heldFetch(subscriber(slowUser, inDays(30)))

      const held = deliver('RENEWAL', slowUser, slow.fetch)
      await slow.reading
      const other = await deliver(
        'RENEWAL',
        otherUser,
        Effect.sync(() => subscriber(otherUser, inDays(30)))
      )
      const whileHeld = {
        other: await statusOf(otherUser),
        slow: await statusOf(slowUser),
      }
      await slow.release()

      expect(other._tag).toBe('Success')
      expect(whileHeld).toEqual({ other: ['active'], slow: [] })
      expect((await held)._tag).toBe('Success')
    })

    it('lets the account be deleted while a sync is between its two writes', async () => {
      const userId = await aUser()
      await deliver(
        'INITIAL_PURCHASE',
        userId,
        Effect.sync(() => subscriber(userId, inDays(30)))
      )
      const pause = `pause_sync_${crypto.randomUUID().replaceAll('-', '')}`
      const gate = await pool.connect()
      try {
        await gate.query('SELECT pg_advisory_lock($1, 0)', [PAUSE_KEYSPACE])
        await pool.query(
          `CREATE FUNCTION ${pause}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(${PAUSE_KEYSPACE}, 0); RETURN NEW; END $$`
        )
        await pool.query(
          `CREATE TRIGGER ${pause} BEFORE INSERT ON subscription_events FOR EACH ROW WHEN (NEW.user_id = '${userId}') EXECUTE FUNCTION ${pause}()`
        )

        const sync = deliver(
          'EXPIRATION',
          userId,
          Effect.sync(() => subscriber(userId, inDays(-1)))
        )
        await sessionsWaitingForALock(pool, 1)
        const deletion = pool
          .query('DELETE FROM users WHERE id = $1', [userId])
          .then(
            () => 'deleted',
            (error: { code?: string }) => `failed ${error.code}`
          )
        await sessionsWaitingForALock(pool, 2)
        await gate.query('SELECT pg_advisory_unlock_all()')

        expect(await deletion).toBe('deleted')
        expect((await sync)._tag).toBe('Success')
      } finally {
        await gate.query('SELECT pg_advisory_unlock_all()')
        gate.release()
        await pool.query(`DROP FUNCTION IF EXISTS ${pause}() CASCADE`)
      }
    })

    it('acknowledges a delivery for an account that no longer exists and writes nothing', async () => {
      const userId = crypto.randomUUID()
      userIds.push(userId)

      const delivery = await deliver(
        'RENEWAL',
        userId,
        Effect.sync(() => subscriber(userId, inDays(30)))
      )

      expect(delivery._tag).toBe('Success')
      expect(await statusOf(userId)).toEqual([])
    })
  }
)
