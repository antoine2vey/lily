import {
  NotificationRepository,
  NotificationRepositoryLive,
} from '@lily/api/repositories/notification.repository'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Effect, Layer } from 'effect'
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

const DatabaseLive = NotificationRepositoryLive.pipe(
  Layer.provideMerge(DrizzleLive),
  Layer.provideMerge(PgLive)
)

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Notifications of a type already recorded today - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    afterAll(async () => {
      await pool.end()
    })

    beforeEach(async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    const recordedToday = async (
      timezone: string,
      now: string,
      createdAt: string
    ) => {
      vi.setSystemTime(new Date(now))
      const [user] = await db
        .insert(schema.users)
        .values({
          email: 'today-window@example.com',
          name: 'today-window',
          emailVerified: true,
          timezone,
        })
        .returning()
      if (!user) throw new Error('user insert returned nothing')
      await db.insert(schema.notifications).values({
        type: 'streak_at_risk',
        scheduledAt: new Date(createdAt),
        createdAt: new Date(createdAt),
        userId: user.id,
      })
      return Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* NotificationRepository
          return yield* repo.hasNotificationOfTypesTodayForUser(
            user.id,
            timezone,
            ['streak_at_risk']
          )
        }).pipe(Effect.provide(DatabaseLive))
      )
    }

    it.each([
      {
        timezone: 'Europe/Paris',
        clock: '00:30 on the 25-hour day, 20 minutes after the row',
        now: '2026-10-24T22:30:00.000Z',
        createdAt: '2026-10-24T22:10:00.000Z',
        expected: true,
      },
      {
        timezone: 'Europe/Paris',
        clock:
          '00:30 on the 25-hour day, 40 minutes after a row of the day before',
        now: '2026-10-24T22:30:00.000Z',
        createdAt: '2026-10-24T21:50:00.000Z',
        expected: false,
      },
      {
        timezone: 'America/New_York',
        clock: '00:30 on the 25-hour day, 20 minutes after the row',
        now: '2026-11-01T04:30:00.000Z',
        createdAt: '2026-11-01T04:10:00.000Z',
        expected: true,
      },
      {
        timezone: 'Pacific/Auckland',
        clock: '00:30 on the 25-hour day, 20 minutes after the row',
        now: '2026-04-04T11:30:00.000Z',
        createdAt: '2026-04-04T11:10:00.000Z',
        expected: true,
      },
      {
        timezone: 'Pacific/Kiritimati',
        clock: 'local midnight, one millisecond after the row',
        now: '2026-06-16T10:00:00.000Z',
        createdAt: '2026-06-16T09:59:59.999Z',
        expected: false,
      },
      {
        timezone: 'Pacific/Pago_Pago',
        clock: 'the last millisecond of the day, on a row from its first',
        now: '2026-06-16T10:59:59.999Z',
        createdAt: '2026-06-15T11:00:00.000Z',
        expected: true,
      },
    ])(
      'answers $expected in $timezone at $clock',
      async ({ timezone, now, createdAt, expected }) => {
        expect(await recordedToday(timezone, now, createdAt)).toBe(expected)
      }
    )

    const sentToday = async (timezone: string, now: string, sentAt: string) => {
      vi.setSystemTime(new Date(now))
      const [user] = await db
        .insert(schema.users)
        .values({
          email: 'sent-today@example.com',
          name: 'sent-today',
          emailVerified: true,
          timezone,
        })
        .returning()
      if (!user) throw new Error('user insert returned nothing')
      const [plant] = await db
        .insert(schema.plants)
        .values({
          userId: user.id,
          createdByUserId: user.id,
          name: 'Monstera',
          health: 'HEALTHY',
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
        })
        .returning()
      if (!plant) throw new Error('plant insert returned nothing')
      await db.insert(schema.notifications).values({
        type: 'watering_reminder',
        status: 'sent',
        scheduledAt: new Date(sentAt),
        sentAt: new Date(sentAt),
        userId: user.id,
        plantId: plant.id,
      })
      return Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* NotificationRepository
          return yield* repo.hasNotificationToday(user.id, plant.id, timezone)
        }).pipe(Effect.provide(DatabaseLive))
      )
    }

    it.each([
      {
        timezone: 'America/Los_Angeles',
        clock: '17:30, on a reminder sent at 09:00 the same local day',
        now: '2026-06-16T00:30:00.000Z',
        sentAt: '2026-06-15T16:00:00.000Z',
        expected: true,
      },
      {
        timezone: 'America/Los_Angeles',
        clock: '09:00, on a reminder sent at 21:00 the evening before',
        now: '2026-06-15T16:00:00.000Z',
        sentAt: '2026-06-15T04:00:00.000Z',
        expected: false,
      },
    ])(
      'answers $expected for a sent reminder in $timezone at $clock',
      async ({ timezone, now, sentAt, expected }) => {
        expect(await sentToday(timezone, now, sentAt)).toBe(expected)
      }
    )
  }
)
