import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import {
  SubscriptionRepository,
  SubscriptionRepositoryLive,
} from '@lily/api/repositories/subscription.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { ChatTurns } from '@lily/api/services/ai-chat/chat-turns'
import {
  type Billing,
  UsageTracker,
  UsageTrackerLive,
} from '@lily/api/services/subscriptions/usage-tracker'
import { PgLive } from '@lily/db'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import * as schema from '@lily/db/schema'
import { asc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import {
  Array as Arr,
  ConfigProvider,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  ManagedRuntime,
  Schema,
} from 'effect'
import pg from 'pg'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

const { Pool } = pg

class ChatStreamFailed extends Schema.TaggedError<
  ChatStreamFailed,
  { readonly brand: unique symbol }
>()('ChatStreamFailed', {}) {}

// Each test replays the run of the same name in
// packages/api/models/usage-reservation.qnt.
describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'usage reservation model runs - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let runtime: ManagedRuntime.ManagedRuntime<
      Layer.Success<typeof AppLayer>,
      Layer.Error<typeof AppLayer>
    >
    let userId: string
    let limit: number

    const ConfigLive = ConfigProvider.layer(
      ConfigProvider.fromUnknown({
        DATABASE_URL: process.env.DATABASE_URL_TEST,
      })
    )
    const DbLive = PgDrizzle.layer.pipe(
      Layer.provideMerge(PgLive.pipe(Layer.provide(ConfigLive)))
    )
    // Same nesting as ServerLive: the turns and the tracker sit above the
    // connection pool, so shutdown interrupts a turn while its refund can
    // still reach Postgres.
    const AppLayer = Layer.mergeAll(UsageTrackerLive, ChatTurns.layer).pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          SubscriptionRepositoryLive,
          NotificationRepositoryLive,
          UserRepositoryLive,
          MockAlerterLive
        ).pipe(Layer.provideMerge(DbLive))
      )
    )

    // One chat turn as streamChatMessage meters it: the model stream is
    // `work`, and a reply bills a charge where a model error bills a refund.
    const send = (work: Effect.Effect<void, ChatStreamFailed>) =>
      Effect.gen(function* () {
        const tracker = yield* UsageTracker
        const chatTurns = yield* ChatTurns
        return yield* tracker.withDetachedReservation(userId, 'aiChats', {
          start: Effect.void,
          work: () => work,
          bill: (exit) =>
            Effect.succeed<Billing>(Exit.isSuccess(exit) ? 'charge' : 'refund'),
          detach: chatTurns.fork,
        })
      })

    const unitsByMonth = async () => {
      const rows = await db
        .select()
        .from(schema.subscriptionUsage)
        .where(eq(schema.subscriptionUsage.userId, userId))
        .orderBy(asc(schema.subscriptionUsage.periodStart))
      return Arr.map(rows, (row) => row.aiChatsCount)
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      const [free] = await db
        .select()
        .from(schema.subscriptionTiers)
        .where(eq(schema.subscriptionTiers.tier, 'free'))
      if (!free?.maxAiChatsMonthly) {
        throw new Error(
          'Subscription tiers not seeded. Run: bun run db:setup-test'
        )
      }
      limit = free.maxAiChatsMonthly
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `reservation-model-${Date.now()}@example.com`,
          name: 'reservation model',
          emailVerified: true,
          role: 'user',
          status: 'active',
        })
        .returning()
      if (!user) throw new Error('DB insertion failed.')
      userId = user.id
    })

    beforeEach(async () => {
      await db
        .delete(schema.subscriptionUsage)
        .where(eq(schema.subscriptionUsage.userId, userId))
      runtime = ManagedRuntime.make(AppLayer)
    })

    afterEach(async () => {
      vi.useRealTimers()
      await runtime.dispose()
    })

    afterAll(async () => {
      await db.delete(schema.users).where(eq(schema.users.id, userId))
      await pool.end()
    })

    it('parallelOverrun: three sends racing for the last two units get two replies', async () => {
      const exits = await runtime.runPromise(
        Effect.gen(function* () {
          const repo = yield* SubscriptionRepository
          // Taken at once so each racing send below finds an open connection.
          yield* Effect.all(
            Arr.makeBy(limit - 2, () =>
              repo.reserveUsage(userId, 'aiChats', null)
            ),
            { concurrency: 'unbounded' }
          )
          return yield* Effect.all(
            Arr.makeBy(3, () =>
              Effect.exit(
                Effect.flatMap(send(Effect.void), ({ settled }) =>
                  Fiber.join(settled)
                )
              )
            ),
            { concurrency: 'unbounded' }
          )
        })
      )

      expect(
        Arr.length(Arr.filter(exits, Exit.isSuccess)),
        'replies handed out for the last two units of the month'
      ).toBe(2)
      expect(
        await unitsByMonth(),
        `units counted in a month limited to ${limit}`
      ).toEqual([limit])
    })

    it('rolloverRefund: a turn charged in January and failed in February gives January its unit back', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(Date.UTC(2026, 0, 31, 23, 59))

      const billings = await runtime.runPromise(
        Effect.gen(function* () {
          const modelFails = yield* Deferred.make<void>()
          const january = yield* send(
            Deferred.await(modelFails).pipe(
              Effect.andThen(Effect.fail(new ChatStreamFailed()))
            )
          )
          yield* Effect.sync(() => vi.setSystemTime(Date.UTC(2026, 1, 1, 0, 1)))
          const february = yield* send(Effect.void)
          yield* Deferred.succeed(modelFails, undefined)
          return yield* Effect.all([
            Fiber.join(january.settled),
            Fiber.join(february.settled),
          ])
        })
      )

      expect(billings).toEqual(['refund', 'charge'])
      expect(
        await unitsByMonth(),
        'units left on [January, February] after the January turn failed in February'
      ).toEqual([0, 1])
    })

    it('shutdownMidTurn: a turn the shutdown cuts off gives its unit back', async () => {
      await runtime.runPromise(
        Effect.gen(function* () {
          const working = yield* Deferred.make<void>()
          yield* send(
            Deferred.succeed(working, undefined).pipe(
              Effect.andThen(Effect.never)
            )
          )
          yield* Deferred.await(working)
        })
      )
      expect(await unitsByMonth()).toEqual([1])

      await runtime.dispose()

      expect(
        await unitsByMonth(),
        'units still charged to a turn the shutdown cut off'
      ).toEqual([0])
    }, 60_000)
  }
)
