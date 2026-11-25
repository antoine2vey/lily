import { sessionsWaitingForALock } from '@lily/api/__tests__/integration/lock-waits'
import { createMockRagService } from '@lily/api/__tests__/mocks/rag.service'
import { DailyTipRepositoryLive } from '@lily/api/repositories/daily-tip.repository'
import { EngagementRepositoryLive } from '@lily/api/repositories/engagement.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { checkAndGenerateTip } from '@lily/api/services/tips-scheduler/scheduler'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { ZoneName } from '@lily/shared'
import { and, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Effect, Layer, Logger } from 'effect'
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

const DatabaseLive = Layer.mergeAll(
  EngagementRepositoryLive,
  DailyTipRepositoryLive,
  NotificationRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

// 00:30 on 15 June in Paris, the zone of every user here: both slots of the
// day are ahead. The tip of the UTC day 14 June is the one on offer.
const NOW = '2026-06-14T22:30:00.000Z'
const LOCAL_DAY = '2026-06-15'

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'One daily tip per user and local day - Integration',
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
      vi.setSystemTime(new Date(NOW))
      vi.stubEnv('TIPS_GENERATION_ENABLED', 'true')
      await db.execute(
        sql`TRUNCATE TABLE users, daily_tips RESTART IDENTITY CASCADE`
      )
      await db.insert(schema.dailyTips).values({
        title: { en: 'Rotate your pots' },
        body: { en: 'Turn each pot a quarter every week.' },
        category: 'light',
        publishDate: '2026-06-14',
      })
    })

    afterEach(() => {
      vi.useRealTimers()
      vi.unstubAllEnvs()
    })

    const createUser = async (name: string) => {
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `${name}@example.com`,
          name,
          emailVerified: true,
          timezone: ZoneName.make('Europe/Paris'),
        })
        .returning()
      if (!user) throw new Error('user insert returned nothing')
      return user
    }

    const tick = (warnings: unknown[] = []) =>
      Effect.runPromise(
        checkAndGenerateTip.pipe(
          Effect.provide(
            Layer.mergeAll(
              DatabaseLive,
              createMockRagService(),
              Logger.layer([
                Logger.make(({ logLevel, message }) => {
                  if (logLevel === 'Warn') warnings.push(message)
                }),
              ])
            )
          )
        )
      )

    const tipsOf = (userId: string) =>
      db
        .select({ status: schema.notifications.status })
        .from(schema.notifications)
        .where(
          and(
            eq(schema.notifications.userId, userId),
            eq(schema.notifications.type, 'daily_tip')
          )
        )

    const blockTipInserts = async () => {
      const holder = await pool.connect()
      await holder.query('BEGIN')
      await holder.query('LOCK TABLE notifications IN SHARE MODE')
      return holder
    }

    it('records one tip when two api processes tick at the same moment', async () => {
      const user = await createUser('two-ticks')
      const holder = await blockTipInserts()
      try {
        const ticks = Promise.all([tick(), tick()])
        expect(await sessionsWaitingForALock(pool, 2)).toBe(2)
        await holder.query('COMMIT')
        await ticks
      } finally {
        holder.release()
      }

      expect(await tipsOf(user.id)).toEqual([{ status: 'pending' }])
    })

    it('records no other tip on the local day of a tip that failed', async () => {
      const user = await createUser('failed-today')
      await db.insert(schema.notifications).values({
        type: 'daily_tip',
        status: 'failed',
        scheduledAt: new Date('2026-06-14T22:10:00.000Z'),
        createdAt: new Date('2026-06-14T22:10:00.000Z'),
        occasionDay: LOCAL_DAY,
        userId: user.id,
      })

      await tick()

      expect(await tipsOf(user.id)).toEqual([{ status: 'failed' }])
    })

    it('counts a tip that failed yesterday toward the three-day cadence', async () => {
      const user = await createUser('failed-yesterday')
      await db.insert(schema.notifications).values({
        type: 'daily_tip',
        status: 'failed',
        scheduledAt: new Date('2026-06-14T08:00:00.000Z'),
        createdAt: new Date('2026-06-14T08:00:00.000Z'),
        occasionDay: '2026-06-14',
        userId: user.id,
      })

      await tick()

      expect(await tipsOf(user.id)).toEqual([{ status: 'failed' }])
    })

    it('records the other users when the tip of one is already there', async () => {
      const taken = await createUser('taken')
      const other = await createUser('other')
      const warnings: unknown[] = []
      const holder = await blockTipInserts()
      try {
        const run = tick(warnings)
        expect(await sessionsWaitingForALock(pool, 2)).toBe(2)
        await holder.query(
          `INSERT INTO notifications (type, scheduled_at, user_id, occasion_day)
           VALUES ('daily_tip', now(), $1, $2)`,
          [taken.id, LOCAL_DAY]
        )
        await holder.query('COMMIT')
        await run
      } finally {
        holder.release()
      }

      expect(await tipsOf(taken.id)).toEqual([{ status: 'pending' }])
      expect(await tipsOf(other.id)).toEqual([{ status: 'pending' }])
      expect(warnings).toEqual([])
    })
  }
)
