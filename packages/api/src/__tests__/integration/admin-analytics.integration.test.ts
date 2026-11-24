import { careDayOf } from '@lily/api/__tests__/integration/care-rows'
import {
  AnalyticsRepository,
  AnalyticsRepositoryLive,
} from '@lily/api/repositories/analytics.repository'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import type { UsersByStatusResponse } from '@lily/shared/admin/analytics'
import { eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, DateTime, Effect, Layer, Option, pipe } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

const AppLive = AnalyticsRepositoryLive.pipe(
  Layer.provideMerge(DrizzleLive),
  Layer.provideMerge(PgLive)
)

const analytics = <A, E>(
  use: (repo: AnalyticsRepository['Service']) => Effect.Effect<A, E>
) =>
  Effect.runPromise(
    Effect.provide(Effect.flatMap(AnalyticsRepository, use), AppLive)
  )

// A window no other suite writes to, so the range metrics count only this
// suite's rows.
const at = (iso: string) => new Date(`2001-03-${iso}Z`)
const range = { from: at('01T00:00:00'), to: at('04T00:00:00') }

const suffix = crypto.randomUUID()
const topics = [`analytics-a-${suffix}`, `analytics-b-${suffix}`] as const
const limitLabel = `analytics-limit-${suffix}`

const plantValues = {
  name: 'Monstera',
  humidityRating: 3,
  lightingRating: 3,
  petToxicityRating: 1,
  wateringRating: 3,
}

const sum = <A>(rows: ReadonlyArray<A>, count: (a: A) => number) =>
  Array.reduce(rows, 0, (acc, row) => acc + count(row))

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'admin analytics queries - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    const userIds: Array<string> = []
    const today = DateTime.formatIsoDate(DateTime.nowUnsafe())

    const createUser = async (
      status: 'active' | 'banned' = 'active'
    ): Promise<string> => {
      const id = crypto.randomUUID()
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `analytics-${id}@example.com`,
          name: `analytics-${id}`,
          emailVerified: true,
          role: 'user',
          status,
        })
        .returning()
      if (!user) throw new Error('DB insertion failed.')
      userIds.push(user.id)
      return user.id
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })

      const userId = await createUser()
      const [plant, other] = await db
        .insert(schema.plants)
        .values([
          { ...plantValues, userId, createdByUserId: userId },
          { ...plantValues, userId, createdByUserId: userId },
        ])
        .returning()
      if (!plant || !other) throw new Error('DB insertion failed.')

      const careAt = (
        type: 'watering' | 'misting',
        date: Date,
        plantId = plant.id
      ) => ({
        plantId,
        performedByUserId: userId,
        type,
        date,
        careDay: careDayOf(date),
      })
      await db
        .insert(schema.careLogs)
        .values([
          careAt('watering', at('01T10:00:00')),
          careAt('watering', at('01T11:00:00'), other.id),
          careAt('misting', at('02T07:00:00')),
        ])

      const sentAt = (type: 'watering_reminder' | 'daily_tip', sent: Date) => ({
        userId,
        plantId: plant.id,
        type,
        status: 'sent' as const,
        scheduledAt: sent,
        sentAt: sent,
      })
      await db
        .insert(schema.notifications)
        .values([
          sentAt('watering_reminder', at('01T08:00:00')),
          sentAt('watering_reminder', at('02T08:00:00')),
          sentAt('daily_tip', at('01T09:00:00')),
        ])

      const [conversation] = await db
        .insert(schema.chatConversations)
        .values({ userId, kind: 'general' })
        .returning()
      if (!conversation) throw new Error('DB insertion failed.')
      await db.insert(schema.chatMessages).values(
        Array.map(
          [
            at('01T08:00:00'),
            at('01T09:00:00'),
            at('01T10:00:00'),
            at('02T10:00:00'),
          ],
          (createdAt) => ({
            role: 'user',
            content: 'hello',
            userId,
            conversationId: conversation.id,
            createdAt,
          })
        )
      )

      const deadLetter = (topic: string, error: string, failedAt: Date) => ({
        originalMessageId: crypto.randomUUID(),
        topic,
        payload: {},
        error,
        retryCount: 3,
        failedAt,
      })
      await db
        .insert(schema.deadLetterMessages)
        .values([
          deadLetter(topics[0], 'boom', at('01T12:00:00')),
          deadLetter(topics[0], 'boom', at('01T13:00:00')),
          deadLetter(topics[1], 'bang', at('03T12:00:00')),
        ])

      const now = Date.now()
      await db.insert(schema.userSubscriptions).values({
        userId,
        tier: 'paid',
        status: 'active',
        currentPeriodStart: new Date(now - 10 * 86_400_000),
        currentPeriodEnd: new Date(now + 20 * 86_400_000),
      })
      await db.insert(schema.subscriptionEvents).values([
        {
          userId,
          eventType: 'trial_started',
          createdAt: new Date(now - 5 * 86_400_000),
        },
        {
          userId,
          eventType: 'usage_limit_reached',
          metadata: JSON.stringify({ limit: limitLabel }),
          createdAt: new Date(now - 3 * 86_400_000 - 3_600_000),
        },
        {
          userId,
          eventType: 'subscription_created',
          metadata: JSON.stringify({ tier: 'paid' }),
          createdAt: new Date(now - 3 * 86_400_000),
        },
      ])
    })

    afterAll(async () => {
      await db
        .delete(schema.deadLetterMessages)
        .where(inArray(schema.deadLetterMessages.topic, [...topics]))
      await db
        .delete(schema.analyticsDailySnapshots)
        .where(eq(schema.analyticsDailySnapshots.date, today))
      await db.delete(schema.users).where(inArray(schema.users.id, userIds))
      await pool.end()
    })

    it('counts users by status', async () => {
      const banned = (result: UsersByStatusResponse) =>
        pipe(
          Array.findFirst(result.byStatus, (s) => s.status === 'banned'),
          Option.match({ onNone: () => 0, onSome: (s) => s.count })
        )
      const before = await analytics((repo) => repo.usersByStatus)
      await createUser('banned')
      const after = await analytics((repo) => repo.usersByStatus)

      expect(after.total).toBe(before.total + 1)
      expect(banned(after)).toBe(banned(before) + 1)
      expect(after.total).toBe(sum(after.byStatus, (s) => s.count))
    })

    it('counts active subscribers by tier', async () => {
      const result = await analytics((repo) => repo.activeSubscribersByTier)

      expect(result.total).toBe(sum(result.byTier, (t) => t.count))
      expect(
        Array.some(
          result.byTier,
          (t) => t.tier === 'paid' && t.status === 'active' && t.count >= 1
        )
      ).toBe(true)
    })

    it('puts every user in one plant bucket', async () => {
      const result = await analytics((repo) => repo.plantsPerUserDistribution)

      expect(Array.map(result.buckets, (b) => b.label)).toEqual([
        '0',
        '1',
        '2-5',
        '6-10',
        '11-25',
        '25+',
      ])
      expect(sum(result.buckets, (b) => b.count)).toBe(result.totalUsers)
      expect(result.totalPlants).toBeGreaterThanOrEqual(1)
    })

    it('counts care logs per type and UTC day in the range', async () => {
      const result = await analytics((repo) => repo.careLogVolumeByType(range))

      expect(result).toEqual({
        totalInRange: 3,
        series: [
          { type: 'misting', points: [{ date: '2001-03-02', value: 1 }] },
          { type: 'watering', points: [{ date: '2001-03-01', value: 2 }] },
        ],
      })
    })

    it('counts dead letters per topic and day, with the top errors', async () => {
      const result = await analytics((repo) => repo.deadLetterVolume(range))

      expect(result).toEqual({
        totalInRange: 3,
        series: [
          { topic: topics[0], points: [{ date: '2001-03-01', value: 2 }] },
          { topic: topics[1], points: [{ date: '2001-03-03', value: 1 }] },
        ],
        topErrors: [
          { topic: topics[0], error: 'boom', count: 2 },
          { topic: topics[1], error: 'bang', count: 1 },
        ],
      })
    })

    it('counts chat messages and their senders per day', async () => {
      const result = await analytics((repo) => repo.aiChatVolume(range))

      expect(result).toEqual({
        totalMessages: 4,
        uniqueUsers: 1,
        trend: [
          { date: '2001-03-01', messages: 3, users: 1 },
          { date: '2001-03-02', messages: 1, users: 1 },
        ],
      })
    })

    it('attributes a conversion to the limit reached before it', async () => {
      const result = await analytics((repo) => repo.paywallAttribution)

      expect(result.totalConversions).toBe(sum(result.byLimit, (l) => l.count))
      expect(
        Array.filter(result.byLimit, (l) => l.label === limitLabel)
      ).toEqual([{ label: limitLabel, count: 1 }])
    })

    it('measures signup to first plant', async () => {
      const result = await analytics((repo) => repo.signupToFirstPlant)

      expect(result.steps[0]?.count).toBe(result.cohortSize)
      expect(result.steps[1]?.count).toBeGreaterThanOrEqual(1)
      expect(result.steps[1]?.count).toBeLessThanOrEqual(result.cohortSize)
      expect(typeof result.medianHoursToFirstPlant).toBe('number')
    })

    it('measures trial to paid', async () => {
      const result = await analytics((repo) => repo.trialToPaid)

      expect(result.converted).toBeGreaterThanOrEqual(1)
      expect(result.converted).toBeLessThanOrEqual(result.trialsStarted)
      expect(result.conversionRate).toBe(
        result.converted / result.trialsStarted
      )
      expect(typeof result.medianDaysToConvert).toBe('number')
    })

    it('counts care reminders acted on within 24 hours', async () => {
      const result = await analytics((repo) =>
        repo.notificationToCareAction(range)
      )

      expect(result).toEqual({
        remindersSent: 2,
        actedOnWithin24h: 1,
        actionRate: 0.5,
      })
    })

    it('reads back the snapshots it computed and wrote', async () => {
      const { mrr, dau, churn } = await analytics((repo) =>
        Effect.gen(function* () {
          const mrr = yield* repo.computeMrrSnapshot
          const dau = yield* repo.computeDauWauMauSnapshot
          const churn = yield* repo.computePaidChurnSnapshot
          yield* repo.writeSnapshot(today, 'mrr_estimate', mrr)
          yield* repo.writeSnapshot(today, 'dau_wau_mau', dau)
          yield* repo.writeSnapshot(today, 'paid_churn_monthly', churn)
          return { mrr, dau, churn }
        })
      )
      const read = await analytics((repo) =>
        Effect.all({
          mrr: repo.getMrrEstimate,
          dau: repo.getDauWauMau,
          churn: repo.getPaidChurn,
        })
      )

      expect(mrr.cents).toBeGreaterThanOrEqual(299)
      expect(read.mrr.currentCents).toBe(mrr.cents)
      expect(Array.last(read.mrr.trend)).toEqual(
        Option.some({ date: today, value: mrr.cents })
      )
      expect([read.dau.dau, read.dau.wau, read.dau.mau]).toEqual([
        dau.dau,
        dau.wau,
        dau.mau,
      ])
      expect(read.churn.currentRate).toBe(churn.rate)
    })
  }
)
