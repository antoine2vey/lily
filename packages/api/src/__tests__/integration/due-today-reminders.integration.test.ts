import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockRateLimiterService } from '@lily/api/__tests__/mocks/rate-limiter.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { cancelDelegation } from '@lily/api/services/delegation/endpoints/cancel-delegation'
import { completeDelegation } from '@lily/api/services/delegation/endpoints/complete-delegation'
import { pollAndTransition } from '@lily/api/services/delegation-scheduler/scheduler'
import { rescheduleReminders } from '@lily/api/services/plants/helpers/reconcile-reminders'
import { updateUserSettings } from '@lily/api/services/user/endpoints/update-user-settings'
import { endVacation } from '@lily/api/services/vacation/helpers/end-vacation'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array as Arr, Effect, Layer, ManagedRuntime, References } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const DAY_MS = 24 * 60 * 60 * 1000

const ServicesLive = Layer.mergeAll(
  PlantRepositoryLive,
  CareLogRepositoryLive,
  CareScheduleRepositoryLive,
  NotificationRepositoryLive,
  UserRepositoryLive,
  CanopyRepositoryLive,
  DelegationRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

type DelegationStatus = 'pending' | 'accepted' | 'active'

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'A reminder due today survives every reminder rebuild - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let runtime: ManagedRuntime.ManagedRuntime<
      Layer.Success<typeof ServicesLive>,
      Layer.Error<typeof ServicesLive>
    >
    let names: Map<string, string>
    let owner: string
    let ann: string
    let fern: string

    const todayStart = new Date(Math.floor(Date.now() / DAY_MS) * DAY_MS)

    const as = <A, E, R>(userId: string, effect: Effect.Effect<A, E, R>) =>
      runtime.runPromise(
        effect.pipe(
          Effect.provide(
            Layer.mergeAll(
              createMockCurrentUser({ id: userId }),
              createMockMessageQueue(),
              createMockRateLimiterService()
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        ) as Effect.Effect<A, E, Layer.Success<typeof ServicesLive>>
      )

    const user = async (
      name: string,
      extra: Partial<typeof schema.users.$inferInsert> = {}
    ) => {
      const [row] = await db
        .insert(schema.users)
        .values({
          email: `${name}-${Date.now()}@example.com`,
          name,
          emailVerified: true,
          role: 'user',
          status: 'active',
          timezone: 'UTC',
          careReminders: true,
          preferredNotificationTime: '09:00',
          ...extra,
        })
        .returning()
      if (!row) throw new Error(`Failed to create ${name}`)
      names.set(row.id, name)
      return row
    }

    const dueTodayPlant = async (name: string, userId: string) => {
      const [row] = await db
        .insert(schema.plants)
        .values({
          userId,
          createdByUserId: userId,
          name,
          health: 'HEALTHY',
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
        })
        .returning()
      if (!row) throw new Error(`Failed to create ${name}`)
      names.set(row.id, name)
      await db.insert(schema.plantCareSchedules).values({
        plantId: row.id,
        careType: 'watering',
        frequencyDays: 7,
        nextCareAt: todayStart,
        lastCareAt: new Date(todayStart.getTime() - 7 * DAY_MS),
      })
      return row.id
    }

    const delegate = async (
      plantId: string,
      ownerId: string,
      caretakerId: string,
      status: DelegationStatus,
      startDate: Date,
      endDate: Date
    ) => {
      const [row] = await db
        .insert(schema.careDelegations)
        .values({ ownerId, caretakerId, status, startDate, endDate })
        .returning()
      if (!row) throw new Error('Failed to create delegation')
      await db
        .insert(schema.delegationPlants)
        .values({ delegationId: row.id, plantId })
      return row.id
    }

    const remindToday = (userId: string, plantId: string) =>
      db.insert(schema.notifications).values({
        type: 'watering_reminder',
        scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
        userId,
        plantId,
        status: 'pending',
      })

    const dueWithinADay = async () =>
      Arr.map(
        Arr.filter(
          await db
            .select({
              userId: schema.notifications.userId,
              plantId: schema.notifications.plantId,
              scheduledAt: schema.notifications.scheduledAt,
            })
            .from(schema.notifications)
            .where(sql`${schema.notifications.status} = 'pending'`),
          (row) => row.scheduledAt.getTime() < Date.now() + DAY_MS
        ),
        (row) => `${names.get(row.plantId ?? '')} -> ${names.get(row.userId)}`
      )

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      runtime = ManagedRuntime.make(ServicesLive)
    })

    beforeEach(async () => {
      for (const table of [
        'notifications',
        'care_delegations',
        'plant_care_schedules',
        'plants',
        'users',
      ]) {
        await db.execute(
          sql.raw(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`)
        )
      }
      names = new Map()
      owner = (await user('owner')).id
      ann = (await user('ann')).id
      fern = await dueTodayPlant('fern', owner)
    })

    afterAll(async () => {
      await runtime.dispose()
      await pool.end()
    })

    it('keeps the owner reminder when the plant reminders are rescheduled', async () => {
      await remindToday(owner, fern)

      await as(owner, rescheduleReminders([fern]))

      expect(await dueWithinADay()).toEqual(['fern -> owner'])
    })

    it('keeps the owner reminder when the owner changes timezone', async () => {
      await remindToday(owner, fern)

      await as(owner, updateUserSettings({ timezone: 'Europe/Paris' }))

      expect(await dueWithinADay()).toEqual(['fern -> owner'])
    })

    it('keeps the owner reminder when the owner changes reminder time', async () => {
      await remindToday(owner, fern)

      await as(
        owner,
        updateUserSettings({ preferredNotificationTime: '10:00' })
      )

      expect(await dueWithinADay()).toEqual(['fern -> owner'])
    })

    it('hands the reminder to the caretaker when the scheduler starts a delegation', async () => {
      await delegate(
        fern,
        owner,
        ann,
        'accepted',
        new Date(Date.now() - 60_000),
        new Date(Date.now() + 7 * DAY_MS)
      )
      await remindToday(owner, fern)

      await as(owner, pollAndTransition)

      expect(await dueWithinADay()).toEqual(['fern -> ann'])
    })

    it('hands the reminder back to the owner when the scheduler ends a delegation', async () => {
      await delegate(
        fern,
        owner,
        ann,
        'active',
        new Date(Date.now() - 3 * DAY_MS),
        new Date(Date.now() - 60_000)
      )
      await remindToday(ann, fern)

      await as(owner, pollAndTransition)

      expect(await dueWithinADay()).toEqual(['fern -> owner'])
    })

    it('hands the reminder back to the owner when the owner completes a delegation early', async () => {
      const delegation = await delegate(
        fern,
        owner,
        ann,
        'active',
        new Date(Date.now() - 3 * DAY_MS),
        new Date(Date.now() + 3 * DAY_MS)
      )
      await remindToday(ann, fern)

      await as(owner, completeDelegation(delegation))

      expect(await dueWithinADay()).toEqual(['fern -> owner'])
    })

    it.each(['pending', 'accepted'] as const)(
      'keeps the owner reminder when a %s delegation is canceled',
      async (status) => {
        const delegation = await delegate(
          fern,
          owner,
          ann,
          status,
          new Date(Date.now() + 2 * DAY_MS),
          new Date(Date.now() + 7 * DAY_MS)
        )
        await remindToday(owner, fern)

        await as(owner, cancelDelegation(delegation))

        expect(await dueWithinADay()).toEqual(['fern -> owner'])
      }
    )

    it('hands the reminder back to the owner when an active delegation is canceled', async () => {
      const delegation = await delegate(
        fern,
        owner,
        ann,
        'active',
        new Date(Date.now() - DAY_MS),
        new Date(Date.now() + 7 * DAY_MS)
      )
      await remindToday(ann, fern)

      await as(owner, cancelDelegation(delegation))

      expect(await dueWithinADay()).toEqual(['fern -> owner'])
    })

    const vacationer = () =>
      user('vic', {
        vacationStatus: 'active',
        vacationStart: new Date(Date.now() - 2 * DAY_MS),
        vacationEnd: new Date(Date.now() + 2 * DAY_MS),
      })

    it('keeps the caretaker reminder when the owner of a delegated plant ends a vacation', async () => {
      const vic = await vacationer()
      const ivy = await dueTodayPlant('ivy', vic.id)
      await delegate(
        ivy,
        vic.id,
        ann,
        'active',
        new Date(Date.now() - 3 * DAY_MS),
        new Date(Date.now() + 7 * DAY_MS)
      )
      await remindToday(ann, ivy)

      await as(vic.id, endVacation({ user: vic, effectiveEnd: new Date() }))

      expect(
        Arr.filter(await dueWithinADay(), (row) => row.startsWith('ivy'))
      ).toEqual(['ivy -> ann'])
    })
  }
)
