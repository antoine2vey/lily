import { createMockRevenueCatProvider } from '@lily/api/__tests__/mocks/revenuecat.provider'
import { SubscriptionRepositoryLive } from '@lily/api/repositories/subscription.repository'
import { handleRevenueCatWebhook } from '@lily/api/services/subscriptions/endpoints/webhook/handle-revenuecat-webhook'
import { DrizzleLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import {
  PaymentProviderError,
  type RevenueCatEventType,
  type RevenueCatSubscriberInfo,
} from '@lily/shared'
import { failureOf } from '@lily/shared/testing'
import { eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { ConfigProvider, Effect, Layer } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000)

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'RevenueCat webhook redelivery - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let userId: string
    const userIds: string[] = []
    const periodStart = inDays(-1)
    const periodEnd = inDays(30)

    const RepoLive = SubscriptionRepositoryLive.pipe(
      Layer.provide(DrizzleLive),
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            DATABASE_URL: process.env.DATABASE_URL_TEST,
          })
        )
      )
    )

    const activeSubscriber = (): RevenueCatSubscriberInfo => ({
      subscriber: {
        original_app_user_id: userId,
        subscriptions: {
          lily_monthly: {
            expires_date: periodEnd.toISOString(),
            purchase_date: periodStart.toISOString(),
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
      id: string,
      subscriberInfo: Effect.Effect<
        RevenueCatSubscriberInfo,
        PaymentProviderError
      > = Effect.sync(activeSubscriber)
    ) =>
      Effect.runPromiseExit(
        handleRevenueCatWebhook(
          JSON.stringify({
            api_version: '1.0',
            event: {
              type,
              id,
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

    const stored = async () => ({
      webhookEvents: await db
        .select({ id: schema.revenuecatWebhookEvents.id })
        .from(schema.revenuecatWebhookEvents)
        .where(eq(schema.revenuecatWebhookEvents.appUserId, userId)),
      subscriptions: await db
        .select()
        .from(schema.userSubscriptions)
        .where(eq(schema.userSubscriptions.userId, userId)),
      subscriptionEvents: await db
        .select({ eventType: schema.subscriptionEvents.eventType })
        .from(schema.subscriptionEvents)
        .where(eq(schema.subscriptionEvents.userId, userId)),
    })

    beforeAll(() => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    beforeEach(async () => {
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `revenuecat-webhook-${crypto.randomUUID()}@example.com`,
          name: `revenuecat_webhook_${crypto.randomUUID()}`,
          emailVerified: true,
          role: 'user',
          status: 'active',
        })
        .returning()
      userId = user!.id
      userIds.push(userId)
    })

    afterAll(async () => {
      await db
        .delete(schema.revenuecatWebhookEvents)
        .where(inArray(schema.revenuecatWebhookEvents.appUserId, userIds))
      await db.delete(schema.users).where(inArray(schema.users.id, userIds))
      await pool.end()
    })

    it('stores one event row and one subscription change when the same event arrives twice', async () => {
      expect((await deliver('INITIAL_PURCHASE', `evt-${userId}`))._tag).toBe(
        'Success'
      )
      expect((await deliver('INITIAL_PURCHASE', `evt-${userId}`))._tag).toBe(
        'Success'
      )

      const { webhookEvents, subscriptions, subscriptionEvents } =
        await stored()
      expect(webhookEvents).toEqual([{ id: `evt-${userId}` }])
      expect(subscriptions).toHaveLength(1)
      expect(subscriptions[0]).toMatchObject({
        tier: 'paid',
        status: 'active',
        currentPeriodEnd: periodEnd,
        externalSubscriptionId: 'txn-1',
      })
      expect(subscriptionEvents).toEqual([
        { eventType: 'subscription_created' },
      ])
    })

    it('keeps the subscription active when a stale EXPIRATION arrives after RENEWAL', async () => {
      await deliver('RENEWAL', `renewal-${userId}`)
      await deliver('EXPIRATION', `expiration-${userId}`)

      const { webhookEvents, subscriptions, subscriptionEvents } =
        await stored()
      expect(webhookEvents).toHaveLength(2)
      expect(subscriptions).toMatchObject([
        { status: 'active', currentPeriodEnd: periodEnd },
      ])
      expect(subscriptionEvents).toEqual([
        { eventType: 'subscription_created' },
      ])
    })

    it('stores nothing while the RevenueCat fetch fails, then applies the retry', async () => {
      const failed = await deliver(
        'INITIAL_PURCHASE',
        `evt-${userId}`,
        Effect.fail(
          new PaymentProviderError({
            message: 'down',
            code: 'revenuecat_api_error',
          })
        )
      )

      expect(failureOf(failed)).toMatchObject({
        _tag: 'PaymentProviderError',
      })
      expect(await stored()).toEqual({
        webhookEvents: [],
        subscriptions: [],
        subscriptionEvents: [],
      })

      expect((await deliver('INITIAL_PURCHASE', `evt-${userId}`))._tag).toBe(
        'Success'
      )
      const { webhookEvents, subscriptions } = await stored()
      expect(webhookEvents).toEqual([{ id: `evt-${userId}` }])
      expect(subscriptions).toMatchObject([{ status: 'active' }])
    })
  }
)
