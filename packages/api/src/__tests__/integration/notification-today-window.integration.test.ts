import {
  NotificationRepository,
  NotificationRepositoryLive,
} from '@lily/api/repositories/notification.repository'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import {
  startOfTodayAsDate,
  startOfTomorrowAsDate,
  ZoneName,
} from '@lily/shared'
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
      timezone: ZoneName,
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
          return yield* repo.hasNotificationIn({
            userId: user.id,
            topics: ['streak_at_risk'],
            counting: 'produced',
            from: startOfTodayAsDate(timezone),
            until: startOfTomorrowAsDate(timezone),
          })
        }).pipe(Effect.provide(DatabaseLive))
      )
    }

    it.each([
      {
        timezone: ZoneName.make('Europe/Paris'),
        clock: '00:30 on the 25-hour day, 20 minutes after the row',
        now: '2026-10-24T22:30:00.000Z',
        createdAt: '2026-10-24T22:10:00.000Z',
        expected: true,
      },
      {
        timezone: ZoneName.make('Europe/Paris'),
        clock:
          '00:30 on the 25-hour day, 40 minutes after a row of the day before',
        now: '2026-10-24T22:30:00.000Z',
        createdAt: '2026-10-24T21:50:00.000Z',
        expected: false,
      },
      {
        timezone: ZoneName.make('America/New_York'),
        clock: '00:30 on the 25-hour day, 20 minutes after the row',
        now: '2026-11-01T04:30:00.000Z',
        createdAt: '2026-11-01T04:10:00.000Z',
        expected: true,
      },
      {
        timezone: ZoneName.make('Pacific/Auckland'),
        clock: '00:30 on the 25-hour day, 20 minutes after the row',
        now: '2026-04-04T11:30:00.000Z',
        createdAt: '2026-04-04T11:10:00.000Z',
        expected: true,
      },
      {
        timezone: ZoneName.make('Pacific/Kiritimati'),
        clock: 'local midnight, one millisecond after the row',
        now: '2026-06-16T10:00:00.000Z',
        createdAt: '2026-06-16T09:59:59.999Z',
        expected: false,
      },
      {
        timezone: ZoneName.make('Pacific/Pago_Pago'),
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

    const sentToday = async (
      timezone: ZoneName,
      now: string,
      sentAt: string
    ) => {
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
          return yield* repo.hasNotificationIn({
            userId: user.id,
            plantId: plant.id,
            counting: 'sent',
            from: startOfTodayAsDate(timezone),
            until: startOfTomorrowAsDate(timezone),
          })
        }).pipe(Effect.provide(DatabaseLive))
      )
    }

    it.each([
      {
        timezone: ZoneName.make('America/Los_Angeles'),
        clock: '17:30, on a reminder sent at 09:00 the same local day',
        now: '2026-06-16T00:30:00.000Z',
        sentAt: '2026-06-15T16:00:00.000Z',
        expected: true,
      },
      {
        timezone: ZoneName.make('America/Los_Angeles'),
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

    it('counts a waiting row of the plant since the bound, and no failed one', async () => {
      vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'))
      const [user] = await db
        .insert(schema.users)
        .values({
          email: 'since@example.com',
          name: 'since',
          emailVerified: true,
        })
        .returning()
      if (!user) throw new Error('user insert returned nothing')
      const [fern, palm] = await db
        .insert(schema.plants)
        .values(
          ['Fern', 'Palm'].map((name) => ({
            userId: user.id,
            createdByUserId: user.id,
            name,
            health: 'HEALTHY' as const,
            humidityRating: 3,
            lightingRating: 3,
            petToxicityRating: 1,
            wateringRating: 3,
          }))
        )
        .returning()
      if (!fern || !palm) throw new Error('plant insert returned nothing')
      await db.insert(schema.notifications).values([
        {
          type: 'photo_reminder',
          status: 'pending',
          scheduledAt: new Date('2026-06-15T18:00:00.000Z'),
          createdAt: new Date('2026-06-14T12:00:00.000Z'),
          userId: user.id,
          plantId: fern.id,
        },
        {
          type: 'photo_reminder',
          status: 'failed',
          scheduledAt: new Date('2026-06-15T18:00:00.000Z'),
          createdAt: new Date('2026-06-14T12:00:00.000Z'),
          userId: user.id,
          plantId: palm.id,
        },
      ])
      const since = (plantId: string, from: string) =>
        Effect.runPromise(
          Effect.gen(function* () {
            const repo = yield* NotificationRepository
            return yield* repo.hasNotificationIn({
              userId: user.id,
              topics: ['photo_reminder'],
              plantId,
              counting: 'produced',
              from: new Date(from),
            })
          }).pipe(Effect.provide(DatabaseLive))
        )

      expect(
        await Promise.all([
          since(fern.id, '2026-06-14T12:00:00.000Z'),
          since(fern.id, '2026-06-14T12:00:00.001Z'),
          since(palm.id, '2026-06-01T00:00:00.000Z'),
        ])
      ).toEqual([true, false, false])
    })
  }
)
