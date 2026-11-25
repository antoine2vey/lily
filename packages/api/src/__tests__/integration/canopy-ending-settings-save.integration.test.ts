import { settled } from '@lily/api/__tests__/integration/canopy-layers'
import {
  deadlocks,
  sessionsWaitingForALock,
} from '@lily/api/__tests__/integration/lock-waits'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockRateLimiterService } from '@lily/api/__tests__/mocks/rate-limiter.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import { Canopy } from '@lily/api/contexts/canopy'
import { CareReadsLive } from '@lily/api/contexts/care'
import { ReminderStoreLive } from '@lily/api/contexts/reminders'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { NotificationDeliveryLive } from '@lily/api/repositories/notification-delivery.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { updateUserSettings } from '@lily/api/services/user/endpoints/update-user-settings'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { Rating, ZoneName } from '@lily/shared'
import { and, eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Cause, Effect, Exit, Layer, References } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

// The advisory keyspace the pause trigger waits in. No kernel lock uses it.
const PAUSE_KEYSPACE = 384_384

type Member = 'owner' | 'first' | 'second'

const AppLive = Layer.mergeAll(
  CanopyRepositoryLive,
  CareScheduleRepositoryLive,
  CareReadsLive,
  CareLogRepositoryLive,
  DelegationRepositoryLive,
  NotificationRepositoryLive,
  NotificationDeliveryLive,
  ReminderStoreLive,
  PlantRepositoryLive,
  UserRepositoryLive,
  createMockMessageQueue(),
  createMockEventBus(),
  createMockLimitChecker(),
  createMockWeatherProvider(),
  createMockWeatherCache(),
  createMockWeatherRepository()
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'A canopy ending against a settings save of one of its members - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    const userIds: string[] = []
    const canopyIds: string[] = []

    const endingOf = async <A, E>(command: Effect.Effect<A, E>) =>
      Exit.match(
        await Effect.runPromiseExit(
          command.pipe(
            Effect.provideService(References.MinimumLogLevel, 'None')
          )
        ),
        {
          onSuccess: () => 'Success',
          onFailure: (cause) => String(Cause.squash(cause)),
        }
      )

    const aUser = async () => {
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `canopy-ending-${crypto.randomUUID()}@example.com`,
          name: `before_${crypto.randomUUID().slice(0, 8)}`,
          emailVerified: true,
          role: 'user',
          status: 'active',
          timezone: ZoneName.make('UTC'),
        })
        .returning()
      if (!user) throw new Error('user insert failed')
      userIds.push(user.id)
      return user.id
    }

    const aSharedPlant = async (canopyId: string, sharer: string) => {
      const [plant] = await db
        .insert(schema.plants)
        .values({
          name: 'Monstera',
          canopyId,
          createdByUserId: sharer,
          humidityRating: Rating.make(3),
          lightingRating: Rating.make(3),
          petToxicityRating: Rating.make(1),
          wateringRating: Rating.make(3),
        })
        .returning()
      if (!plant) throw new Error('plant insert failed')
      return plant.id
    }

    /**
     * A canopy of an owner and two members who each shared a plant, with a
     * photo reminder that waits for `reminded` on the plant of the first.
     */
    const aCanopyRemindingOfAPhoto = async (reminded: Member) => {
      const ids = {
        owner: await aUser(),
        first: await aUser(),
        second: await aUser(),
      }
      const [canopy] = await db
        .insert(schema.canopies)
        .values({ name: 'Home', timezone: ZoneName.make('UTC') })
        .returning()
      if (!canopy) throw new Error('canopy insert failed')
      canopyIds.push(canopy.id)
      await db.insert(schema.canopyMembers).values(
        (['owner', 'first', 'second'] as const).map((member, joined) => ({
          canopyId: canopy.id,
          userId: ids[member],
          role: member === 'owner' ? ('owner' as const) : ('member' as const),
          joinedAt: new Date(Date.UTC(2026, 0, 1 + joined)),
        }))
      )
      const plantId = await aSharedPlant(canopy.id, ids.first)
      await aSharedPlant(canopy.id, ids.second)
      await db.insert(schema.notifications).values({
        type: 'photo_reminder',
        scheduledAt: new Date(Date.now() + 86_400_000),
        userId: ids[reminded],
        plantId,
        status: 'pending',
      })
      return { ...ids, canopyId: canopy.id }
    }

    const saveTipsOffAndRename = (userId: string, name: string) =>
      endingOf(
        settled(
          updateUserSettings({ name, notifications: { tips: false } })
        ).pipe(
          Effect.provide(
            Layer.mergeAll(
              createMockCurrentUser({ id: userId }),
              createMockRateLimiterService(),
              AppLive
            )
          )
        )
      )

    /**
     * Pauses the settings save of `userId` once it has written the account
     * row and before it deletes the notifications, runs `ending` from a
     * second session, and lets the save go once the ending waits or has
     * ended.
     */
    const endWhileTheSaveIsPaused = async (
      userId: string,
      ending: Effect.Effect<unknown, unknown, Canopy>
    ) => {
      const name = `after_${crypto.randomUUID().slice(0, 8)}`
      const pause = `pause_save_${crypto.randomUUID().replaceAll('-', '')}`
      const gate = await pool.connect()
      try {
        const before = await deadlocks(pool)
        await gate.query('SELECT pg_advisory_lock($1, 0)', [PAUSE_KEYSPACE])
        await pool.query(
          `CREATE FUNCTION ${pause}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(${PAUSE_KEYSPACE}, 0); RETURN NEW; END $$`
        )
        await pool.query(
          `CREATE TRIGGER ${pause} AFTER UPDATE ON users FOR EACH ROW WHEN (NEW.id = '${userId}') EXECUTE FUNCTION ${pause}()`
        )

        const saving = saveTipsOffAndRename(userId, name)
        const paused = await sessionsWaitingForALock(pool, 1)
        const ended = new AbortController()
        const ends = endingOf(
          settled(ending).pipe(Effect.provide(AppLive))
        ).finally(() => ended.abort())
        await sessionsWaitingForALock(pool, 2, ended.signal)
        await gate.query('SELECT pg_advisory_unlock_all()')

        const outcome = { paused, saved: await saving, ended: await ends }
        const [saver] = await db
          .select({ name: schema.users.name })
          .from(schema.users)
          .where(eq(schema.users.id, userId))
        return {
          ...outcome,
          renamed: saver?.name === name,
          deadlocks: (await deadlocks(pool)) - before,
        }
      } finally {
        await gate.query('SELECT pg_advisory_unlock_all()')
        gate.release()
        await pool.query(`DROP FUNCTION IF EXISTS ${pause}() CASCADE`)
      }
    }

    const membersOf = (canopyId: string) =>
      db
        .select({ userId: schema.canopyMembers.userId })
        .from(schema.canopyMembers)
        .where(eq(schema.canopyMembers.canopyId, canopyId))
        .orderBy(schema.canopyMembers.joinedAt)
        .then((rows) => rows.map((row) => row.userId))

    const photoRemindersOf = (userId: string) =>
      db
        .select({ id: schema.notifications.id })
        .from(schema.notifications)
        .where(
          and(
            eq(schema.notifications.userId, userId),
            eq(schema.notifications.type, 'photo_reminder')
          )
        )
        .then((rows) => rows.length)

    beforeAll(() => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    afterAll(async () => {
      await db
        .delete(schema.plants)
        .where(inArray(schema.plants.canopyId, canopyIds))
      await db
        .delete(schema.canopies)
        .where(inArray(schema.canopies.id, canopyIds))
      await db.delete(schema.users).where(inArray(schema.users.id, userIds))
      await pool.end()
    })

    it.each([
      {
        ending: 'the first member leaves',
        saver: 'owner',
        saving: 'the owner',
        end: (canopy: Canopy['Service'], ids: Record<Member, string>) =>
          canopy.leave({ by: ids.first }),
        left: ['owner', 'second'],
      },
      {
        ending: 'the owner dissolves the canopy',
        saver: 'second',
        saving: 'the second member',
        end: (canopy: Canopy['Service'], ids: Record<Member, string>) =>
          canopy.dissolve({ by: ids.owner }),
        left: [],
      },
    ] as const)(
      'commits both when $ending while $saving is between the two writes of a save that turns tips off and renames them',
      async ({ saver, end, left }) => {
        const ids = await aCanopyRemindingOfAPhoto(saver)

        const outcome = await endWhileTheSaveIsPaused(
          ids[saver],
          Effect.flatMap(Canopy, (canopy) => end(canopy, ids))
        )

        expect({
          ...outcome,
          members: await membersOf(ids.canopyId),
          photoReminders: await photoRemindersOf(ids[saver]),
        }).toEqual({
          paused: 1,
          saved: 'Success',
          ended: 'Success',
          renamed: true,
          deadlocks: 0,
          members: left.map((member) => ids[member]),
          photoReminders: 0,
        })
      },
      30_000
    )
  }
)
