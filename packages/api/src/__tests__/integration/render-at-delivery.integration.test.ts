import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockPushService } from '@lily/api/__tests__/mocks/push.service'
import { ActivityPushTokenRepositoryLive } from '@lily/api/repositories/activity-push-token.repository'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { DeviceTokenRepositoryLive } from '@lily/api/repositories/device-token.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import {
  dispatchNow,
  recordNotification,
} from '@lily/api/services/helpers/schedule-notification'
import { processMessage } from '@lily/api/services/notification-scheduler/worker'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import type { PushMessage, QueueMessage } from '@lily/shared/server'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, Effect, Layer, References } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

const RepositoriesLive = Layer.mergeAll(
  ActivityPushTokenRepositoryLive,
  CanopyRepositoryLive,
  CareLogRepositoryLive,
  CareScheduleRepositoryLive,
  DelegationRepositoryLive,
  DeviceTokenRepositoryLive,
  NotificationRepositoryLive,
  PlantRepositoryLive,
  UserRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Notification content rendered at delivery - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
    })

    afterAll(async () => {
      await pool.end()
    })

    const seedUser = async (label: string) => {
      const stamp = `${label}-${Date.now()}`
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `${stamp}@example.com`,
          name: stamp,
          emailVerified: true,
          timezone: 'UTC',
          language: 'en',
        })
        .returning()
      if (!user) throw new Error('user insert returned nothing')
      await db.insert(schema.deviceTokens).values({
        token: `ExponentPushToken[${stamp}]`,
        platform: 'ios',
        userId: user.id,
      })
      return user
    }

    const pipeline = () => {
      const enqueued: QueueMessage[] = []
      const pushes: PushMessage[] = []
      const layer = Layer.mergeAll(
        RepositoriesLive,
        MockAlerterLive,
        createMockMessageQueue({
          onEnqueue: (_topic, message) => {
            enqueued.push(message)
          },
        }),
        createMockPushService({
          onSendBatch: (messages) => {
            pushes.push(...messages)
          },
        })
      )
      const run = <A, E>(
        effect: Effect.Effect<A, E, Layer.Success<typeof layer>>
      ) =>
        Effect.runPromise(
          effect.pipe(
            Effect.provide(layer),
            Effect.provideService(References.MinimumLogLevel, 'None')
          )
        )
      return { enqueued, pushes, run }
    }

    const storedRow = async (id: string) => {
      const [row] = await db
        .select({
          status: schema.notifications.status,
          title: schema.notifications.title,
          body: schema.notifications.body,
          params: schema.notifications.params,
        })
        .from(schema.notifications)
        .where(eq(schema.notifications.id, id))
      return row
    }

    it('pushes a row recorded in English in the language the user switched to', async () => {
      const user = await seedUser('switch')
      const { enqueued, pushes, run } = pipeline()

      const recorded = await run(
        recordNotification(
          'streak_at_risk',
          user.id,
          { streakCount: 12, plantName: 'Monstera' },
          'en',
          {}
        )
      )
      expect(await storedRow(recorded.id)).toEqual({
        status: 'queued',
        title: null,
        body: null,
        params: { streakCount: 12, plantName: 'Monstera' },
      })

      await run(dispatchNow(recorded))
      await db
        .update(schema.users)
        .set({ language: 'fr' })
        .where(eq(schema.users.id, user.id))
      for (const message of enqueued) {
        await run(processMessage(message))
      }

      const french = {
        title: '🔥 Ne perds pas ta série de 12 jours !',
        body: "Ta Monstera a encore besoin de soins aujourd'hui. Garde le rythme !",
      }
      expect(Array.map(pushes, ({ title, body }) => ({ title, body }))).toEqual(
        [french]
      )
      expect(await storedRow(recorded.id)).toEqual({
        status: 'sent',
        ...french,
        params: { streakCount: 12, plantName: 'Monstera' },
      })
    })

    it('pushes the stored text of a row written before params existed', async () => {
      const user = await seedUser('legacy')
      const { pushes, run } = pipeline()
      await db
        .update(schema.users)
        .set({ language: 'fr' })
        .where(eq(schema.users.id, user.id))
      const [legacy] = await db
        .insert(schema.notifications)
        .values({
          type: 'streak_at_risk',
          title: "🔥 Don't lose your 12-day streak!",
          body: 'Your Monstera still needs care today. Keep the streak alive!',
          status: 'queued',
          queuedAt: new Date(),
          scheduledAt: new Date(),
          userId: user.id,
          metadata: {},
        })
        .returning()
      if (!legacy) throw new Error('notification insert returned nothing')

      await run(
        processMessage({
          id: crypto.randomUUID(),
          topic: 'streak_at_risk',
          payload: {
            userId: user.id,
            notificationIds: [legacy.id],
            plantIds: [],
            metadata: {},
          },
          retryCount: 0,
          createdAt: new Date(),
          scheduledAt: new Date(),
        })
      )

      const english = {
        title: "🔥 Don't lose your 12-day streak!",
        body: 'Your Monstera still needs care today. Keep the streak alive!',
      }
      expect(Array.map(pushes, ({ title, body }) => ({ title, body }))).toEqual(
        [english]
      )
      expect(await storedRow(legacy.id)).toEqual({
        status: 'sent',
        ...english,
        params: null,
      })
    })
  }
)
