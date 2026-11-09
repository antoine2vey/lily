import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { SubscriptionRepositoryLive } from '@lily/api/repositories/subscription.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import {
  UsageTracker,
  UsageTrackerLive,
} from '@lily/api/services/subscriptions/usage-tracker'
import { PgLive } from '@lily/db'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import * as schema from '@lily/db/schema'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import {
  Array as Arr,
  ConfigProvider,
  DateTime,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Schema,
} from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

class TurnFailed extends Schema.TaggedError<TurnFailed>()('TurnFailed', {}) {}

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'usage refund across a month boundary - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let runtime: ManagedRuntime.ManagedRuntime<
      Layer.Success<typeof AppLayer>,
      Layer.Error<typeof AppLayer>
    >
    let userId: string

    const ConfigLive = ConfigProvider.layer(
      ConfigProvider.fromUnknown({
        DATABASE_URL: process.env.DATABASE_URL_TEST,
      })
    )
    const DbLive = PgDrizzle.layer.pipe(
      Layer.provideMerge(PgLive.pipe(Layer.provide(ConfigLive)))
    )
    const AppLayer = UsageTrackerLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          SubscriptionRepositoryLive,
          NotificationRepositoryLive,
          UserRepositoryLive,
          MockAlerterLive
        ).pipe(Layer.provideMerge(DbLive))
      )
    )

    const previousMonth = () => {
      const start = DateTime.nowUnsafe().pipe(
        DateTime.startOf('month'),
        DateTime.subtract({ months: 1 })
      )
      return {
        periodStart: DateTime.toDateUtc(start),
        periodEnd: DateTime.toDateUtc(start.pipe(DateTime.endOf('month'))),
      }
    }

    const moveUsageRowsBackOneMonth = Effect.promise(() =>
      db
        .update(schema.subscriptionUsage)
        .set(previousMonth())
        .where(eq(schema.subscriptionUsage.userId, userId))
    )

    const usageCounts = async () => {
      const rows = await db
        .select()
        .from(schema.subscriptionUsage)
        .where(eq(schema.subscriptionUsage.userId, userId))
      return Arr.map(rows, (row) => row.aiChatsCount)
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      await db.execute(sql`TRUNCATE TABLE subscription_usage`)
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `month-boundary-${Date.now()}@example.com`,
          name: 'month boundary',
          emailVerified: true,
          role: 'user',
          status: 'active',
        })
        .returning()
      if (!user) throw new Error('DB insertion failed.')
      userId = user.id
      runtime = ManagedRuntime.make(AppLayer)
    })

    afterAll(async () => {
      await runtime.dispose()
      await db.execute(sql`TRUNCATE TABLE subscription_usage`)
      await db.delete(schema.users).where(eq(schema.users.id, userId))
      await pool.end()
    })

    it('refunds the row the turn was charged to once the month has rolled over', async () => {
      const exit = await runtime.runPromise(
        Effect.exit(
          Effect.gen(function* () {
            const tracker = yield* UsageTracker
            return yield* tracker.withReservation(
              userId,
              'aiChats',
              moveUsageRowsBackOneMonth.pipe(
                Effect.andThen(Effect.fail(new TurnFailed()))
              )
            )
          })
        )
      )

      expect(Exit.isFailure(exit)).toBe(true)
      expect(await usageCounts()).toEqual([0])
    })
  }
)
