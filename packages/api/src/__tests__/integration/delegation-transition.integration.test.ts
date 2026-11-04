import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import {
  DelegationRepository,
  DelegationRepositoryLive,
} from '@lily/api/repositories/delegation.repository'
import {
  NotificationRepository,
  NotificationRepositoryLive,
} from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { cancelDelegation } from '@lily/api/services/delegation/endpoints/cancel-delegation'
import { completeDelegation } from '@lily/api/services/delegation/endpoints/complete-delegation'
import { pollAndTransition } from '@lily/api/services/delegation-scheduler/scheduler'
import { rescheduleReminders } from '@lily/api/services/plants/helpers/reconcile-reminders'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array as Arr, Effect, Layer, ManagedRuntime, References } from 'effect'
import { SqlError, UnknownError } from 'effect/sql/SqlError'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const DAY_MS = 24 * 60 * 60 * 1000

const RepositoryLive = DelegationRepositoryLive.pipe(
  Layer.provideMerge(DrizzleLive),
  Layer.provideMerge(PgLive)
)

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'DelegationRepository.transitionStatus - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let ownerId: string
    let caretakerId: string
    let delegationId: string

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })

      await db.execute(
        sql`TRUNCATE TABLE care_delegations RESTART IDENTITY CASCADE`
      )
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)

      const stamp = Date.now()
      const users = await db
        .insert(schema.users)
        .values([
          {
            email: `owner-${stamp}@example.com`,
            name: 'Owner',
            emailVerified: true,
            role: 'user',
            status: 'active',
          },
          {
            email: `caretaker-${stamp}@example.com`,
            name: 'Caretaker',
            emailVerified: true,
            role: 'user',
            status: 'active',
          },
        ])
        .returning()
      const [owner, caretaker] = users
      if (!owner || !caretaker) throw new Error('Failed to create users')
      ownerId = owner.id
      caretakerId = caretaker.id
    })

    beforeEach(async () => {
      await db.execute(
        sql`TRUNCATE TABLE care_delegations RESTART IDENTITY CASCADE`
      )
      const [row] = await db
        .insert(schema.careDelegations)
        .values({
          ownerId,
          caretakerId,
          status: 'accepted',
          startDate: new Date('2024-01-01'),
          endDate: new Date('2099-12-31'),
        })
        .returning()
      if (!row) throw new Error('Failed to create delegation')
      delegationId = row.id
    })

    afterAll(async () => {
      await db.execute(
        sql`TRUNCATE TABLE care_delegations RESTART IDENTITY CASCADE`
      )
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      await pool.end()
    })

    const currentStatus = async () => {
      const [row] = await db
        .select({ status: schema.careDelegations.status })
        .from(schema.careDelegations)
        .where(eq(schema.careDelegations.id, delegationId))
      return row?.status
    }

    it('does not activate a delegation that was canceled after the read', async () => {
      const activated = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* DelegationRepository
          const canceled = yield* repo.transitionStatus(
            delegationId,
            ['pending', 'accepted', 'active'],
            'canceled',
            { canceledAt: new Date() }
          )
          expect(canceled?.status).toBe('canceled')
          return yield* repo.transitionStatus(
            delegationId,
            ['accepted'],
            'active'
          )
        }).pipe(Effect.provide(RepositoryLive))
      )

      expect(activated).toBeNull()
      expect(await currentStatus()).toBe('canceled')
    })

    it('lets exactly one of two concurrent transitions from the same status win', async () => {
      const results = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* DelegationRepository
          return yield* Effect.forEach(
            ['canceled', 'active'] as const,
            (to) => repo.transitionStatus(delegationId, ['accepted'], to),
            { concurrency: 'unbounded' }
          )
        }).pipe(Effect.provide(RepositoryLive))
      )

      const winners = Arr.filter(results, (r) => r !== null)
      expect(winners).toHaveLength(1)
      expect(await currentStatus()).toBe(winners[0]?.status)
    })
  }
)

const rebuildFailsWhen = (
  fails: (plantIds: ReadonlyArray<string>) => boolean
) =>
  Layer.effect(
    NotificationRepository,
    Effect.map(NotificationRepository, (repo) => ({
      ...repo,
      replaceReminders: (replacement) =>
        fails(Arr.map(replacement.plants, (p) => p.plantId))
          ? Effect.fail(
              new SqlError({
                reason: new UnknownError({
                  cause: new Error('injected'),
                  message: 'injected rebuild failure',
                }),
              })
            )
          : repo.replaceReminders(replacement),
    }))
  )

const RebuildAlwaysFails = rebuildFailsWhen(() => true)

const ReminderServicesLive = Layer.mergeAll(
  PlantRepositoryLive,
  CareScheduleRepositoryLive,
  NotificationRepositoryLive,
  UserRepositoryLive,
  CanopyRepositoryLive,
  DelegationRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Delegation transitions move reminders - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let runtime: ManagedRuntime.ManagedRuntime<
      Layer.Success<typeof ReminderServicesLive>,
      Layer.Error<typeof ReminderServicesLive>
    >
    let names: Map<string, string>
    let owner: string
    let toAnn: string
    let toBen: string
    let ivy: string

    const as = <A, E, R>(userId: string, effect: Effect.Effect<A, E, R>) =>
      runtime.runPromise(
        effect.pipe(
          Effect.provide(
            Layer.mergeAll(
              createMockCurrentUser({ id: userId }),
              createMockMessageQueue()
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        ) as Effect.Effect<A, E, Layer.Success<typeof ReminderServicesLive>>
      )

    const user = async (name: string) => {
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
        })
        .returning()
      if (!row) throw new Error(`Failed to create ${name}`)
      names.set(row.id, name)
      return row.id
    }

    const plant = async (name: string, userId: string) => {
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
        nextCareAt: new Date(Date.now() + 3 * DAY_MS),
      })
      return row.id
    }

    const delegate = async (plantId: string, caretakerId: string) => {
      const [row] = await db
        .insert(schema.careDelegations)
        .values({
          ownerId: owner,
          caretakerId,
          status: 'accepted',
          startDate: new Date(Date.now() - DAY_MS),
          endDate: new Date(Date.now() + 30 * DAY_MS),
        })
        .returning()
      if (!row) throw new Error('Failed to create delegation')
      await db
        .insert(schema.delegationPlants)
        .values({ delegationId: row.id, plantId })
      return row.id
    }

    const pendingReminders = async () =>
      Arr.sort(
        Arr.map(
          await db
            .select({
              userId: schema.notifications.userId,
              plantId: schema.notifications.plantId,
              scheduledAt: schema.notifications.scheduledAt,
            })
            .from(schema.notifications)
            .where(sql`${schema.notifications.status} = 'pending'`),
          (row) =>
            `${names.get(row.plantId ?? '')} -> ${names.get(row.userId)} at ${row.scheduledAt.toISOString()}`
        ),
        (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
      )

    const holders = async () =>
      Arr.map(await pendingReminders(), (row) => row.split(' at ')[0])

    const statuses = async () =>
      Arr.map(
        await db
          .select({ status: schema.careDelegations.status })
          .from(schema.careDelegations)
          .orderBy(schema.careDelegations.createdAt),
        (row) => row.status
      )

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      runtime = ManagedRuntime.make(ReminderServicesLive)
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
      owner = await user('owner')
      const ann = await user('ann')
      const ben = await user('ben')
      const fern = await plant('fern', owner)
      ivy = await plant('ivy', owner)
      toAnn = await delegate(fern, ann)
      toBen = await delegate(ivy, ben)
      await as(owner, rescheduleReminders([fern, ivy]))
    })

    afterAll(async () => {
      await runtime.dispose()
      await pool.end()
    })

    it('hands each delegated plant to its own caretaker when the delegations start', async () => {
      expect(await holders()).toEqual(['fern -> owner', 'ivy -> owner'])

      await as(owner, pollAndTransition)

      expect(await holders()).toEqual(['fern -> ann', 'ivy -> ben'])
    })

    it('hands the plant back to the owner when a delegation completes', async () => {
      await as(owner, pollAndTransition)

      await as(owner, completeDelegation(toAnn))
      expect(await holders()).toEqual(['fern -> owner', 'ivy -> ben'])

      await db
        .update(schema.careDelegations)
        .set({ endDate: new Date(Date.now() - 1000) })
        .where(eq(schema.careDelegations.id, toBen))
      await as(owner, pollAndTransition)
      expect(await holders()).toEqual(['fern -> owner', 'ivy -> owner'])
    })

    it('hands the plant back to the owner when an active delegation is canceled', async () => {
      await as(owner, pollAndTransition)

      await as(owner, cancelDelegation(toBen))

      expect(await holders()).toEqual(['fern -> ann', 'ivy -> owner'])
    })

    it('leaves reminders as they were when a delegation is canceled before it starts', async () => {
      const before = await pendingReminders()

      await as(owner, cancelDelegation(toAnn))

      expect(await pendingReminders()).toEqual(before)
    })

    it('leaves delegations accepted and reminders on the owner when the scheduler cannot rebuild them', async () => {
      const before = await pendingReminders()

      await as(owner, Effect.provide(pollAndTransition, RebuildAlwaysFails))

      expect(await statuses()).toEqual(['accepted', 'accepted'])
      expect(await pendingReminders()).toEqual(before)
    })

    it('starts the other delegations of a tick when one of them cannot rebuild its reminders', async () => {
      const rose = await plant('rose', owner)
      await delegate(rose, await user('cat'))
      await as(owner, rescheduleReminders([rose]))

      await as(
        owner,
        Effect.provide(
          pollAndTransition,
          rebuildFailsWhen((plantIds) => plantIds.includes(ivy))
        )
      )

      expect(await statuses()).toEqual(['active', 'accepted', 'active'])
      expect(await holders()).toEqual([
        'fern -> ann',
        'ivy -> owner',
        'rose -> cat',
      ])
    })

    it('keeps a delegation active and its reminders on the caretaker when completing it cannot rebuild them', async () => {
      await as(owner, pollAndTransition)
      const before = await pendingReminders()

      await expect(
        as(owner, Effect.provide(completeDelegation(toAnn), RebuildAlwaysFails))
      ).rejects.toThrow()

      expect(await statuses()).toEqual(['active', 'active'])
      expect(await pendingReminders()).toEqual(before)
    })

    it('keeps a delegation active and its reminders on the caretaker when canceling it cannot rebuild them', async () => {
      await as(owner, pollAndTransition)
      const before = await pendingReminders()

      await expect(
        as(owner, Effect.provide(cancelDelegation(toBen), RebuildAlwaysFails))
      ).rejects.toThrow()

      expect(await statuses()).toEqual(['active', 'active'])
      expect(await pendingReminders()).toEqual(before)
    })
  }
)
