import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import {
  SubscriptionRepository,
  SubscriptionRepositoryLive,
} from '@lily/api/repositories/subscription.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { ChatTurns } from '@lily/api/services/ai-chat/chat-turns'
import {
  RESERVATION_MAX_AGE,
  sweepUsageReservations,
} from '@lily/api/services/subscriptions/reservation-sweep'
import {
  type Billing,
  UsageTracker,
  UsageTrackerLive,
} from '@lily/api/services/subscriptions/usage-tracker'
import { PgLive } from '@lily/db'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import * as schema from '@lily/db/schema'
import { failureOf } from '@lily/shared/testing'
import { asc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import {
  Array as Arr,
  ConfigProvider,
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  Layer,
  ManagedRuntime,
  Schema,
} from 'effect'
import { SqlError, UnknownError } from 'effect/sql/SqlError'
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

class ModelFailed extends Schema.TaggedError<
  ModelFailed,
  { readonly brand: unique symbol }
>()('ModelFailed', {}) {}

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
    let failNextRelease = false

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
    const FlakyReleaseLive = Layer.effect(
      SubscriptionRepository,
      Effect.map(SubscriptionRepository, (repo) => ({
        ...repo,
        releaseUsage: (reservationId) =>
          Effect.suspend(() => {
            if (!failNextRelease) return repo.releaseUsage(reservationId)
            failNextRelease = false
            return Effect.fail(
              new SqlError({
                reason: new UnknownError({
                  cause: new Error('connection lost'),
                  message: 'connection lost',
                }),
              })
            )
          }),
      }))
    ).pipe(Layer.provide(SubscriptionRepositoryLive))
    const AppLayer = Layer.mergeAll(UsageTrackerLive, ChatTurns.layer).pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          FlakyReleaseLive,
          NotificationRepositoryLive,
          UserRepositoryLive,
          MockAlerterLive
        ).pipe(Layer.provideMerge(DbLive))
      )
    )

    // One chat turn as streamChatMessage meters it: the model stream is
    // `work`, and a reply bills a charge where a model error bills a refund.
    const send = (work: Effect.Effect<void, ModelFailed>) =>
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

    const pastTheSweepBound = () =>
      vi.setSystemTime(
        Date.now() + Duration.toMillis(RESERVATION_MAX_AGE) + 1000
      )

    const reservationStates = async () => {
      const rows = await db
        .select({ state: schema.usageReservations.state })
        .from(schema.usageReservations)
        .innerJoin(
          schema.subscriptionUsage,
          eq(schema.usageReservations.usageId, schema.subscriptionUsage.id)
        )
        .where(eq(schema.subscriptionUsage.userId, userId))
      return Arr.map(rows, (row) => row.state)
    }

    const unitsByMonth = async (
      count: 'aiChatsCount' | 'plantIdentifiesCount' = 'aiChatsCount'
    ) => {
      const rows = await db
        .select()
        .from(schema.subscriptionUsage)
        .where(eq(schema.subscriptionUsage.userId, userId))
        .orderBy(asc(schema.subscriptionUsage.periodStart))
      return Arr.map(rows, (row) => row[count])
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
      failNextRelease = false
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
          // Taken at once to open one connection per racing send. On a cold
          // pool the first send finishes while the others still connect, and
          // a reserve that reads before it writes would pass.
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
              Effect.andThen(Effect.fail(new ModelFailed()))
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

    it('rolloverRefundInRequest: an identify charged in January and failed in February gives January its unit back', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(Date.UTC(2026, 0, 31, 23, 59))

      const exit = await runtime.runPromise(
        Effect.exit(
          Effect.gen(function* () {
            const tracker = yield* UsageTracker
            return yield* tracker.withReservation(
              userId,
              'plantIdentifies',
              Effect.sync(() =>
                vi.setSystemTime(Date.UTC(2026, 1, 1, 0, 1))
              ).pipe(Effect.andThen(Effect.fail(new ModelFailed())))
            )
          })
        )
      )

      expect(failureOf(exit)).toBeInstanceOf(ModelFailed)
      expect(
        await unitsByMonth('plantIdentifiesCount'),
        'units left on January after the January identify failed in February'
      ).toEqual([0])
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

    it('killMidTurn: a unit reserved by a process that died is refunded by the sweep', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(Date.UTC(2026, 0, 15, 12, 0))

      await runtime.runPromise(
        Effect.gen(function* () {
          const repo = yield* SubscriptionRepository
          yield* repo.reserveUsage(userId, 'aiChats', limit)
          yield* sweepUsageReservations
        })
      )
      expect(
        await unitsByMonth(),
        'units held by a turn that may still be running'
      ).toEqual([1])

      pastTheSweepBound()
      await runtime.runPromise(sweepUsageReservations)

      expect(
        await unitsByMonth(),
        'units still counted for a turn no process is running'
      ).toEqual([0])
      expect(await reservationStates()).toEqual(['refunded'])
    })

    it('lostRefund: a refund that failed is made by the sweep', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(Date.UTC(2026, 0, 15, 12, 0))
      failNextRelease = true

      const billing = await runtime.runPromise(
        Effect.flatMap(send(Effect.fail(new ModelFailed())), ({ settled }) =>
          Fiber.join(settled)
        )
      )
      expect(billing).toBe('refund')
      expect(
        await unitsByMonth(),
        'units left by the refund that failed'
      ).toEqual([1])

      pastTheSweepBound()
      await runtime.runPromise(sweepUsageReservations)

      expect(
        await unitsByMonth(),
        'units still counted for a turn that gave no reply'
      ).toEqual([0])
    })

    it('slowTurn: a sweep refund and the late charge of the same turn never both apply', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(Date.UTC(2026, 0, 15, 12, 0))
      const slowTurns = 5

      await runtime.runPromise(
        Effect.gen(function* () {
          const modelReplies = yield* Deferred.make<void>()
          const turns = yield* Effect.all(
            Arr.makeBy(slowTurns, () => send(Deferred.await(modelReplies))),
            { concurrency: 'unbounded' }
          )
          yield* Effect.sync(pastTheSweepBound)
          yield* Effect.all(
            [
              sweepUsageReservations,
              Deferred.succeed(modelReplies, undefined).pipe(
                Effect.andThen(
                  Effect.forEach(turns, ({ settled }) => Fiber.join(settled), {
                    concurrency: 'unbounded',
                  })
                )
              ),
            ],
            { concurrency: 'unbounded' }
          )
        })
      )

      const states = await reservationStates()
      expect(states).toHaveLength(slowTurns)
      expect(
        Arr.filter(states, (state) => state === 'reserved'),
        'reservations neither charged nor refunded'
      ).toEqual([])
      expect(
        await unitsByMonth(),
        'units counted, against the reservations that were charged'
      ).toEqual([Arr.filter(states, (state) => state === 'charged').length])
    })
  }
)
