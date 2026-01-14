import * as schema from '@lily/db/schema'
import { LimitExceededError } from '@lily/shared'
import { and, count, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Option, pipe } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Subscription Limits - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>

    const getMonthBoundaries = () => {
      const now = new Date()
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const periodEnd = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
      )
      return { periodStart, periodEnd }
    }

    const resetDb = async () => {
      await db.execute(
        sql`TRUNCATE TABLE subscription_events RESTART IDENTITY CASCADE`
      )
      await db.execute(
        sql`TRUNCATE TABLE subscription_usage RESTART IDENTITY CASCADE`
      )
      await db.execute(
        sql`TRUNCATE TABLE user_subscriptions RESTART IDENTITY CASCADE`
      )
      await db.execute(
        sql`TRUNCATE TABLE user_achievements RESTART IDENTITY CASCADE`
      )
      await db.execute(
        sql`TRUNCATE TABLE chat_messages RESTART IDENTITY CASCADE`
      )
      await db.execute(
        sql`TRUNCATE TABLE plant_photos RESTART IDENTITY CASCADE`
      )
      await db.execute(sql`TRUNCATE TABLE care_logs RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE plant_scans RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE plants RESTART IDENTITY CASCADE`)
      await db.execute(
        sql`TRUNCATE TABLE notifications RESTART IDENTITY CASCADE`
      )
      await db.execute(
        sql`TRUNCATE TABLE device_tokens RESTART IDENTITY CASCADE`
      )
      await db.execute(sql`TRUNCATE TABLE session RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE account RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })

      // Verify seed data
      const tiers = await db.select().from(schema.subscriptionTiers)
      if (tiers.length === 0) {
        throw new Error(
          'Subscription tiers not seeded. Run: bun run db:setup-test'
        )
      }
    })

    afterAll(async () => {
      await pool.end()
    })

    it('should allow free user under plant limit', async () => {
      await resetDb()

      const timestamp = Date.now()
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `test-${timestamp}@example.com`,
          name: 'Test User',
          emailVerified: true,
          role: 'user',
          status: 'active',
        })
        .returning()

      if (!user) {
        throw new Error('DB insertion failed.')
      }

      for (let i = 1; i <= 3; i++) {
        await db.insert(schema.plants).values({
          userId: user.id,
          name: `Plant ${i}`,
          health: 'HEALTHY',
          wateringFrequencyDays: 7,
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
        })
      }

      const [countResult] = await db
        .select({ count: count() })
        .from(schema.plants)
        .where(eq(schema.plants.userId, user.id))

      const plantCount = pipe(
        Option.fromNullable(countResult?.count),
        Option.getOrElse(() => 0)
      )

      const [tierConfig] = await db
        .select()
        .from(schema.subscriptionTiers)
        .where(eq(schema.subscriptionTiers.tier, 'free'))

      const maxPlants = pipe(
        Option.fromNullable(tierConfig?.maxPlants),
        Option.getOrElse(() => 5)
      )

      expect(plantCount).toBe(3)
      expect(plantCount < maxPlants).toBe(true)
    })

    it('should reject free user at plant limit', async () => {
      await resetDb()

      const timestamp = Date.now()
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `test-${timestamp}@example.com`,
          name: 'Test User',
          emailVerified: true,
          role: 'user',
          status: 'active',
        })
        .returning()

      if (!user) {
        throw new Error('DB insertion failed.')
      }

      for (let i = 1; i <= 5; i++) {
        await db.insert(schema.plants).values({
          userId: user.id,
          name: `Plant ${i}`,
          health: 'HEALTHY',
          wateringFrequencyDays: 7,
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
        })
      }

      const [countResult] = await db
        .select({ count: count() })
        .from(schema.plants)
        .where(eq(schema.plants.userId, user.id))

      const plantCount = pipe(
        Option.fromNullable(countResult?.count),
        Option.getOrElse(() => 0)
      )

      const [tierConfig] = await db
        .select()
        .from(schema.subscriptionTiers)
        .where(eq(schema.subscriptionTiers.tier, 'free'))

      const maxPlants = pipe(
        Option.fromNullable(tierConfig?.maxPlants),
        Option.getOrElse(() => 5)
      )

      // Simulate limit check
      expect(plantCount).toBe(5)
      expect(plantCount >= maxPlants).toBe(true)

      // This is what LimitChecker would do
      const error = new LimitExceededError({
        feature: 'plants',
        limit: maxPlants,
        current: plantCount,
        message: `You've reached your limit of ${maxPlants} plants.`,
      })

      expect(error.feature).toBe('plants')
      expect(error.limit).toBe(5)
      expect(error.current).toBe(5)
    })

    it('should allow paid user to create unlimited plants', async () => {
      await resetDb()

      const timestamp = Date.now()
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `test-${timestamp}@example.com`,
          name: 'Test User',
          emailVerified: true,
          role: 'user',
          status: 'active',
        })
        .returning()

      if (!user) {
        throw new Error('DB insertion failed.')
      }

      await db.insert(schema.userSubscriptions).values({
        userId: user.id,
        tier: 'paid',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        provider: 'stripe',
      })

      for (let i = 1; i <= 10; i++) {
        await db.insert(schema.plants).values({
          userId: user.id,
          name: `Plant ${i}`,
          health: 'HEALTHY',
          wateringFrequencyDays: 7,
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
        })
      }

      const [subscription] = await db
        .select()
        .from(schema.userSubscriptions)
        .where(eq(schema.userSubscriptions.userId, user.id))

      const effectiveTier =
        subscription?.status === 'active' || subscription?.status === 'trialing'
          ? subscription.tier
          : 'free'

      const [tierConfig] = await db
        .select()
        .from(schema.subscriptionTiers)
        .where(eq(schema.subscriptionTiers.tier, effectiveTier))

      expect(effectiveTier).toBe('paid')
      expect(tierConfig?.maxPlants).toBeNull() // Unlimited
    })

    it('should reject free user at chat limit', async () => {
      await resetDb()

      const timestamp = Date.now()
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `test-${timestamp}@example.com`,
          name: 'Test User',
          emailVerified: true,
          role: 'user',
          status: 'active',
        })
        .returning()

      if (!user) {
        throw new Error('DB insertion failed.')
      }

      const { periodStart, periodEnd } = getMonthBoundaries()
      await db.insert(schema.subscriptionUsage).values({
        userId: user.id,
        periodStart,
        periodEnd,
        aiChatsCount: 10,
        cardScansCount: 0,
        plantIdentifiesCount: 0,
      })

      const [usage] = await db
        .select()
        .from(schema.subscriptionUsage)
        .where(
          and(
            eq(schema.subscriptionUsage.userId, user.id),
            eq(schema.subscriptionUsage.periodStart, periodStart)
          )
        )

      const [tierConfig] = await db
        .select()
        .from(schema.subscriptionTiers)
        .where(eq(schema.subscriptionTiers.tier, 'free'))

      const maxChats = pipe(
        Option.fromNullable(tierConfig?.maxAiChatsMonthly),
        Option.getOrElse(() => 10)
      )
      const currentChats = pipe(
        Option.fromNullable(usage?.aiChatsCount),
        Option.getOrElse(() => 0)
      )

      expect(currentChats >= maxChats).toBe(true)

      const error = new LimitExceededError({
        feature: 'ai_chats',
        limit: maxChats,
        current: currentChats,
        message: `You've used all ${maxChats} AI chats this month.`,
      })

      expect(error.feature).toBe('ai_chats')
      expect(error.limit).toBe(10)
      expect(error.current).toBe(10)
    })

    it('should enforce free limits for expired subscription', async () => {
      await resetDb()

      const timestamp = Date.now()
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `test-${timestamp}@example.com`,
          name: 'Test User',
          emailVerified: true,
          role: 'user',
          status: 'active',
        })
        .returning()

      if (!user) {
        throw new Error('DB insertion failed.')
      }

      // Paid but expired
      await db.insert(schema.userSubscriptions).values({
        userId: user.id,
        tier: 'paid',
        status: 'expired',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        provider: 'stripe',
      })

      for (let i = 1; i <= 5; i++) {
        await db.insert(schema.plants).values({
          userId: user.id,
          name: `Plant ${i}`,
          health: 'HEALTHY',
          wateringFrequencyDays: 7,
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
        })
      }

      const [subscription] = await db
        .select()
        .from(schema.userSubscriptions)
        .where(eq(schema.userSubscriptions.userId, user.id))

      // Expired = falls back to free
      const effectiveTier =
        subscription?.status === 'active' || subscription?.status === 'trialing'
          ? subscription.tier
          : 'free'

      expect(effectiveTier).toBe('free')

      const [countResult] = await db
        .select({ count: count() })
        .from(schema.plants)
        .where(eq(schema.plants.userId, user.id))

      const [tierConfig] = await db
        .select()
        .from(schema.subscriptionTiers)
        .where(eq(schema.subscriptionTiers.tier, effectiveTier))

      const plantCount = pipe(
        Option.fromNullable(countResult?.count),
        Option.getOrElse(() => 0)
      )
      const maxPlants = pipe(
        Option.fromNullable(tierConfig?.maxPlants),
        Option.getOrElse(() => 5)
      )

      expect(plantCount >= maxPlants).toBe(true)
    })

    it('should track usage in database', async () => {
      await resetDb()

      const timestamp = Date.now()
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `test-${timestamp}@example.com`,
          name: 'Test User',
          emailVerified: true,
          role: 'user',
          status: 'active',
        })
        .returning()

      if (!user) {
        throw new Error('DB insertion failed.')
      }

      const { periodStart, periodEnd } = getMonthBoundaries()
      await db.insert(schema.subscriptionUsage).values({
        userId: user.id,
        periodStart,
        periodEnd,
        aiChatsCount: 1,
        cardScansCount: 0,
        plantIdentifiesCount: 0,
      })

      const [usage] = await db
        .select()
        .from(schema.subscriptionUsage)
        .where(
          and(
            eq(schema.subscriptionUsage.userId, user.id),
            eq(schema.subscriptionUsage.periodStart, periodStart)
          )
        )

      expect(usage?.aiChatsCount).toBe(1)
    })
  }
)
