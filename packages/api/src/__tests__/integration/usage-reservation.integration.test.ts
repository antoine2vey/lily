import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { AchievementRepositoryLive } from '@lily/api/repositories/achievement.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { GiftCodeRepositoryLive } from '@lily/api/repositories/gift-code.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { RoomRepositoryLive } from '@lily/api/repositories/room.repository'
import {
  SubscriptionRepository,
  SubscriptionRepositoryLive,
} from '@lily/api/repositories/subscription.repository'
import { createPlant } from '@lily/api/services/plants/endpoints/create-plant'
import { RateLimiterServiceLive } from '@lily/api/services/rate-limiter/service'
import { redeemGiftCode } from '@lily/api/services/subscriptions/endpoints/redeem-gift-code'
import { LimitCheckerLive } from '@lily/api/services/subscriptions/limit-checker'
import { PgLive } from '@lily/db'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import * as schema from '@lily/db/schema'
import { count, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import {
  Array as Arr,
  ConfigProvider,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Option,
  pipe,
} from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

const PARALLELISM = 20

const countSuccesses = <A, E>(exits: ReadonlyArray<Exit.Exit<A, E>>) =>
  Arr.length(Arr.filter(exits, Exit.isSuccess))

const failureTags = <A, E extends { readonly _tag: string }>(
  exits: ReadonlyArray<Exit.Exit<A, E>>
) =>
  Arr.getSomes(
    Arr.map(exits, (exit) =>
      Option.map(Exit.findErrorOption(exit), (e) => e._tag)
    )
  )

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'usage reservations under concurrency - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let runtime: ManagedRuntime.ManagedRuntime<
      Layer.Success<ReturnType<typeof makeAppLayer>>,
      Layer.Error<ReturnType<typeof makeAppLayer>>
    >
    let userId: string

    const makeAppLayer = (currentUserId: string) => {
      const ConfigLive = ConfigProvider.layer(
        ConfigProvider.fromUnknown({
          DATABASE_URL: process.env.DATABASE_URL_TEST,
        })
      )
      const DbLive = PgDrizzle.layer.pipe(
        Layer.provideMerge(PgLive.pipe(Layer.provide(ConfigLive)))
      )
      const ReposLive = Layer.mergeAll(
        SubscriptionRepositoryLive,
        GiftCodeRepositoryLive,
        PlantRepositoryLive,
        CareScheduleRepositoryLive,
        AchievementRepositoryLive,
        RateLimiterServiceLive,
        RoomRepositoryLive
      ).pipe(Layer.provideMerge(DbLive))
      return Layer.mergeAll(
        LimitCheckerLive,
        createMockEventBus(),
        createMockCurrentUser({ id: currentUserId })
      ).pipe(Layer.provideMerge(ReposLive))
    }

    const insertUser = async (label: string) => {
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `${label}-${Date.now()}-${Math.random()}@example.com`,
          name: label,
          emailVerified: true,
          role: 'user',
          status: 'active',
        })
        .returning()
      if (!user) throw new Error('DB insertion failed.')
      return user.id
    }

    const resetDb = async () => {
      for (const table of [
        'subscription_events',
        'subscription_usage',
        'user_subscriptions',
        'gift_code_redemptions',
        'gift_codes',
        'plant_care_schedules',
        'plants',
        'users',
      ]) {
        await db.execute(
          sql.raw(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`)
        )
      }
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      const tiers = await db.select().from(schema.subscriptionTiers)
      if (tiers.length === 0) {
        throw new Error(
          'Subscription tiers not seeded. Run: bun run db:setup-test'
        )
      }
      await resetDb()
      userId = await insertUser('reservation')
      runtime = ManagedRuntime.make(makeAppLayer(userId))
    })

    afterAll(async () => {
      await runtime.dispose()
      await pool.end()
    })

    const inParallel = <A, E, R>(effect: Effect.Effect<A, E, R>, n: number) =>
      Effect.all(
        Arr.makeBy(n, () => Effect.exit(effect)),
        { concurrency: 'unbounded' }
      )

    describe('SubscriptionRepository.reserveUsage', () => {
      it('grants at most the limit across parallel reservations', async () => {
        await db.execute(sql`TRUNCATE TABLE subscription_usage`)
        const limit = 5

        const results = await runtime.runPromise(
          Effect.gen(function* () {
            const repo = yield* SubscriptionRepository
            return yield* inParallel(
              repo.reserveUsage(userId, 'aiChats', limit),
              PARALLELISM
            )
          })
        )

        const granted = pipe(
          results,
          Arr.filter((exit) => Exit.isSuccess(exit) && exit.value !== null),
          Arr.length
        )
        const [row] = await db
          .select()
          .from(schema.subscriptionUsage)
          .where(eq(schema.subscriptionUsage.userId, userId))

        expect(granted).toBe(limit)
        expect(row?.aiChatsCount).toBe(limit)
      })

      it('never refuses when the limit is null and still counts', async () => {
        await db.execute(sql`TRUNCATE TABLE subscription_usage`)

        const results = await runtime.runPromise(
          Effect.gen(function* () {
            const repo = yield* SubscriptionRepository
            return yield* inParallel(
              repo.reserveUsage(userId, 'cardScans', null),
              PARALLELISM
            )
          })
        )

        const [row] = await db
          .select()
          .from(schema.subscriptionUsage)
          .where(eq(schema.subscriptionUsage.userId, userId))

        expect(countSuccesses(results)).toBe(PARALLELISM)
        expect(row?.cardScansCount).toBe(PARALLELISM)
      })

      it('releaseUsage frees a slot and floors at zero', async () => {
        await db.execute(sql`TRUNCATE TABLE subscription_usage`)

        const afterRelease = await runtime.runPromise(
          Effect.gen(function* () {
            const repo = yield* SubscriptionRepository
            yield* repo.reserveUsage(userId, 'plantIdentifies', 1)
            const refused = yield* repo.reserveUsage(
              userId,
              'plantIdentifies',
              1
            )
            yield* repo.releaseUsage(userId, 'plantIdentifies')
            yield* repo.releaseUsage(userId, 'plantIdentifies')
            const granted = yield* repo.reserveUsage(
              userId,
              'plantIdentifies',
              1
            )
            return { refused, granted }
          })
        )

        expect(afterRelease.refused).toBeNull()
        expect(afterRelease.granted?.plantIdentifiesCount).toBe(1)
      })
    })

    describe('redeemGiftCode', () => {
      it('grants a code to at most maxUsages users in parallel', async () => {
        const maxUsages = 3
        const [code] = await db
          .insert(schema.giftCodes)
          .values({ code: 'RACE3', duration: '1m', maxUsages })
          .returning()
        if (!code) throw new Error('DB insertion failed.')
        const userIds = await Promise.all(
          Arr.makeBy(PARALLELISM, (i) => insertUser(`redeemer-${i}`))
        )

        const results = await runtime.runPromise(
          Effect.all(
            Arr.map(userIds, (id) => Effect.exit(redeemGiftCode(id, 'RACE3'))),
            { concurrency: 'unbounded' }
          )
        )

        const [updated] = await db
          .select()
          .from(schema.giftCodes)
          .where(eq(schema.giftCodes.id, code.id))
        const [redemptions] = await db
          .select({ value: count() })
          .from(schema.giftCodeRedemptions)
          .where(eq(schema.giftCodeRedemptions.giftCodeId, code.id))
        const [subscriptions] = await db
          .select({ value: count() })
          .from(schema.userSubscriptions)

        expect(countSuccesses(results)).toBe(maxUsages)
        expect(
          Arr.length(
            Arr.filter(
              failureTags(results),
              (tag) => tag === 'GiftCodeExhaustedError'
            )
          )
        ).toBe(PARALLELISM - maxUsages)
        expect(updated?.currentUsages).toBe(maxUsages)
        expect(redemptions?.value).toBe(maxUsages)
        expect(subscriptions?.value).toBe(maxUsages)
      })

      it('rolls the claim back when the same user redeems twice at once', async () => {
        const [code] = await db
          .insert(schema.giftCodes)
          .values({ code: 'TWICE', duration: '1m', maxUsages: 10 })
          .returning()
        if (!code) throw new Error('DB insertion failed.')
        const twiceUser = await insertUser('twice')

        const results = await runtime.runPromise(
          inParallel(redeemGiftCode(twiceUser, 'TWICE'), 2)
        )

        const [updated] = await db
          .select()
          .from(schema.giftCodes)
          .where(eq(schema.giftCodes.id, code.id))

        expect(countSuccesses(results)).toBe(1)
        expect(failureTags(results)).toEqual(['GiftCodeAlreadyRedeemedError'])
        expect(updated?.currentUsages).toBe(1)
      })
    })

    describe('createPlant', () => {
      it('lets exactly one of parallel requests take the last free slot', async () => {
        const [freeTier] = await db
          .select()
          .from(schema.subscriptionTiers)
          .where(eq(schema.subscriptionTiers.tier, 'free'))
        const maxPlants = freeTier?.maxPlants ?? 5
        await db.execute(sql`TRUNCATE TABLE plants CASCADE`)
        await db.insert(schema.plants).values(
          Arr.makeBy(maxPlants - 1, (i) => ({
            userId,
            name: `Existing ${i}`,
            health: 'HEALTHY' as const,
            humidityRating: 3,
            lightingRating: 3,
            petToxicityRating: 1,
            wateringRating: 3,
          }))
        )

        const results = await runtime.runPromise(
          inParallel(
            createPlant({
              name: 'Last slot',
              wateringFrequencyDays: 7,
              luxNeeded: 2000,
              humidityRating: 3,
              petToxicityRating: 1,
            }),
            10
          )
        )

        const [plants] = await db
          .select({ value: count() })
          .from(schema.plants)
          .where(eq(schema.plants.userId, userId))

        expect(countSuccesses(results)).toBe(1)
        expect(
          Arr.every(failureTags(results), (tag) => tag === 'LimitExceededError')
        ).toBe(true)
        expect(plants?.value).toBe(maxPlants)
      })
    })
  }
)
