import { mockAdminUser } from '@lily/api/__tests__/fixtures/users'
import { sessionsWaitingForALock } from '@lily/api/__tests__/integration/lock-waits'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { GiftCodeRepositoryLive } from '@lily/api/repositories/gift-code.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { NotificationDeliveryLive } from '@lily/api/repositories/notification-delivery.repository'
import { SubscriptionRepositoryLive } from '@lily/api/repositories/subscription.repository'
import {
  UserRepository,
  UserRepositoryLive,
} from '@lily/api/repositories/user.repository'
import { giftSubscription } from '@lily/api/services/admin/endpoints/gift-subscription'
import { revokeGiftSubscription } from '@lily/api/services/admin/endpoints/revoke-gift-subscription'
import { AdminUser } from '@lily/api/services/admin/middleware'
import { RateLimiterServiceLive } from '@lily/api/services/rate-limiter/service'
import { redeemGiftCode } from '@lily/api/services/subscriptions/endpoints/redeem-gift-code'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { failureOf } from '@lily/shared/testing'
import { inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { ConfigProvider, Effect, Exit, Layer } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

// The advisory keyspace the pause trigger waits in. No kernel lock uses it.
const PAUSE_KEYSPACE = 441_441

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Gift subscriptions against an account deletion - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    const userIds: string[] = []
    const codeIds: string[] = []

    const AppLive = Layer.mergeAll(
      SubscriptionRepositoryLive,
      GiftCodeRepositoryLive,
      UserRepositoryLive,
      NotificationRepositoryLive,
      NotificationDeliveryLive,
      RateLimiterServiceLive
    ).pipe(
      Layer.provideMerge(DrizzleLive),
      Layer.provideMerge(PgLive),
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            DATABASE_URL: process.env.DATABASE_URL_TEST,
          })
        )
      ),
      Layer.merge(createMockMessageQueue()),
      Layer.merge(
        Layer.succeed(AdminUser, {
          id: mockAdminUser.id,
          email: mockAdminUser.email,
          name: mockAdminUser.name,
          firstName: null,
          lastName: null,
          username: undefined,
          createdAt: mockAdminUser.createdAt,
          updatedAt: mockAdminUser.updatedAt,
          role: mockAdminUser.role,
          status: mockAdminUser.status,
        })
      )
    )

    /** The account is erased right after the command has read it. */
    const ErasedOnceRead = Layer.effect(
      UserRepository,
      Effect.gen(function* () {
        const repo = yield* UserRepository
        return {
          ...repo,
          findById: (id: string) =>
            Effect.tap(repo.findById(id), () =>
              Effect.promise(() =>
                pool.query('DELETE FROM users WHERE id = $1', [id])
              )
            ),
        }
      })
    ).pipe(Layer.provide(AppLive))

    const endingOf = async <A, E extends { readonly _tag: string }>(
      command: Effect.Effect<A, E, Layer.Success<typeof AppLive>>,
      layer: typeof AppLive = AppLive
    ) => {
      const exit = await Effect.runPromiseExit(
        command.pipe(Effect.provide(layer))
      )
      return Exit.isSuccess(exit) ? 'Success' : failureOf(exit)._tag
    }

    const aSubscriber = async () => {
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `gift-deletion-${crypto.randomUUID()}@example.com`,
          name: `gift_deletion_${crypto.randomUUID()}`,
          emailVerified: true,
          role: 'user',
          status: 'active',
        })
        .returning()
      userIds.push(user!.id)
      await db.insert(schema.userSubscriptions).values({
        userId: user!.id,
        tier: 'free',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
      })
      return user!.id
    }

    const aGiftCode = async () => {
      const [code] = await db
        .insert(schema.giftCodes)
        .values({
          code: `GIFT-${crypto.randomUUID()}`.toUpperCase(),
          duration: '1m',
          maxUsages: 1,
        })
        .returning()
      codeIds.push(code!.id)
      return code!.code
    }

    /**
     * Pauses `command` at its insert into `pausedAt`, deletes the account from
     * a second session, and lets the command go once the deletion waits or
     * has ended.
     */
    const deleteWhilePaused = async (
      userId: string,
      pausedAt: 'subscription_events' | 'gift_code_redemptions',
      command: () => Promise<string>
    ) => {
      const pause = `pause_gift_${crypto.randomUUID().replaceAll('-', '')}`
      const gate = await pool.connect()
      try {
        await gate.query('SELECT pg_advisory_lock($1, 0)', [PAUSE_KEYSPACE])
        await pool.query(
          `CREATE FUNCTION ${pause}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(${PAUSE_KEYSPACE}, 0); RETURN NEW; END $$`
        )
        await pool.query(
          `CREATE TRIGGER ${pause} BEFORE INSERT ON ${pausedAt} FOR EACH ROW WHEN (NEW.user_id = '${userId}') EXECUTE FUNCTION ${pause}()`
        )

        const running = command()
        const paused = await sessionsWaitingForALock(pool, 1)
        const ended = new AbortController()
        const deletion = pool
          .query('DELETE FROM users WHERE id = $1', [userId])
          .then(
            () => 'deleted',
            (error: { code?: string }) => `failed ${error.code}`
          )
          .finally(() => ended.abort())
        await sessionsWaitingForALock(pool, 2, ended.signal)
        await gate.query('SELECT pg_advisory_unlock_all()')

        return { paused, deletion: await deletion, command: await running }
      } finally {
        await gate.query('SELECT pg_advisory_unlock_all()')
        gate.release()
        await pool.query(`DROP FUNCTION IF EXISTS ${pause}() CASCADE`)
      }
    }

    beforeAll(() => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    afterAll(async () => {
      await db.delete(schema.users).where(inArray(schema.users.id, userIds))
      await db
        .delete(schema.giftCodes)
        .where(inArray(schema.giftCodes.id, codeIds))
      await db.delete(schema.rateLimits).where(
        inArray(
          schema.rateLimits.key,
          userIds.map((id) => `redeem-code:${id}`)
        )
      )
      await pool.end()
    })

    it('lets the account be deleted while a gift is between its two writes', async () => {
      const userId = await aSubscriber()

      const outcome = await deleteWhilePaused(
        userId,
        'subscription_events',
        () => endingOf(giftSubscription(userId, '1m'))
      )

      expect(outcome).toEqual({
        paused: 1,
        deletion: 'deleted',
        command: 'Success',
      })
    })

    it('holds no row of the account when a redemption reaches its redemption insert', async () => {
      const userId = await aSubscriber()
      const code = await aGiftCode()

      const outcome = await deleteWhilePaused(
        userId,
        'gift_code_redemptions',
        () => endingOf(redeemGiftCode(userId, code))
      )

      // The deletion wins, so the redemption insert breaks its foreign key.
      // A subscription write placed before that insert would hold the row the
      // deletion waits for, and this deletion would end in 40P01.
      expect(outcome).toEqual({
        paused: 1,
        deletion: 'deleted',
        command: 'SqlError',
      })
    })

    it('lets the account be deleted while a revocation is between its two writes', async () => {
      const userId = await aSubscriber()

      const outcome = await deleteWhilePaused(
        userId,
        'subscription_events',
        () => endingOf(revokeGiftSubscription(userId))
      )

      expect(outcome).toEqual({
        paused: 1,
        deletion: 'deleted',
        command: 'Success',
      })
    })

    it('refuses a gift for an account deleted after the gift read it', async () => {
      const userId = await aSubscriber()

      const ending = await endingOf(
        giftSubscription(userId, '1m'),
        Layer.merge(AppLive, ErasedOnceRead)
      )

      expect(ending).toBe('UserNotFoundError')
    })

    it('refuses a revocation for an account deleted after the revocation read it', async () => {
      const userId = await aSubscriber()

      const ending = await endingOf(
        revokeGiftSubscription(userId),
        Layer.merge(AppLive, ErasedOnceRead)
      )

      expect(ending).toBe('UserNotFoundError')
    })
  }
)
