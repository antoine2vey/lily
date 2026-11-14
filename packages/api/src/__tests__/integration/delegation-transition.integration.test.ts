import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import {
  AbsenceOnPostgresLive,
  absenceOverStore,
  settled,
} from '@lily/api/__tests__/integration/absence-layers'
import { ManualOutboxLive } from '@lily/api/__tests__/integration/care-layers'
import { careDayOf } from '@lily/api/__tests__/integration/care-rows'
import { waitsForALock } from '@lily/api/__tests__/integration/lock-waits'
import { createStubCare } from '@lily/api/__tests__/mocks/care'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { transactInMemory } from '@lily/api/__tests__/mocks/transaction'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import { Absence, AbsenceLive } from '@lily/api/contexts/absence'
import { DelegationWrite } from '@lily/api/contexts/absence/domain/delegation'
import {
  AbsenceStore,
  AbsenceStoreLive,
  DelegationNotMovedDefect,
} from '@lily/api/contexts/absence/store'
import { CareReadsLive } from '@lily/api/contexts/care'
import { Dirty, Reminders } from '@lily/api/contexts/reminders'
import { Outbox } from '@lily/api/kernel/outbox'
import { transact } from '@lily/api/kernel/transact'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import {
  NotificationRepository,
  NotificationRepositoryLive,
} from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { cancelDelegation } from '@lily/api/services/delegation/endpoints/cancel-delegation'
import { completeDelegation } from '@lily/api/services/delegation/endpoints/complete-delegation'
import { pollAndTransition } from '@lily/api/services/delegation-scheduler/scheduler'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { DelegationInvalidStatusError } from '@lily/shared'
import { asc, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import {
  Array as Arr,
  Cause,
  DateTime,
  Deferred,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  References,
  Struct,
} from 'effect'
import { SqlError, UnknownError } from 'effect/sql/SqlError'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const DAY_MS = 24 * 60 * 60 * 1000

const StoreLive = AbsenceStoreLive.pipe(
  Layer.provide(
    Layer.mergeAll(
      CanopyRepositoryLive,
      NotificationRepositoryLive,
      createStubCare().layer
    )
  ),
  Layer.provideMerge(DrizzleLive),
  Layer.provideMerge(PgLive)
)

const CommandsLive = Layer.mergeAll(
  NotificationRepositoryLive,
  CanopyRepositoryLive,
  PlantRepositoryLive,
  CareScheduleRepositoryLive,
  CareReadsLive,
  UserRepositoryLive,
  DelegationRepositoryLive,
  createMockWeatherProvider(),
  createMockWeatherCache(),
  createMockWeatherRepository()
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Two changes to one delegation - Integration',
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

    const move = (from: 'Accepted', to: 'Canceled' | 'Active') =>
      Effect.flatMap(AbsenceStore, (store) =>
        store.apply([
          DelegationWrite.MoveDelegation({
            id: delegationId,
            from,
            to,
            at: DateTime.nowUnsafe(),
          }),
        ])
      )

    it('dies instead of activating a delegation that is no longer accepted', async () => {
      const activated = await Effect.runPromiseExit(
        Effect.andThen(
          move('Accepted', 'Canceled'),
          move('Accepted', 'Active')
        ).pipe(transactInMemory, Effect.provide(StoreLive))
      )

      expect(
        Exit.isFailure(activated) && Cause.squash(activated.cause)
      ).toEqual(
        new DelegationNotMovedDefect({
          delegationId,
          from: 'Accepted',
          to: 'Active',
          moved: 0,
        })
      )
      expect(await currentStatus()).toBe('canceled')
    })

    it('lets exactly one of two answers given at once win, and names its status to the other', async () => {
      await db
        .update(schema.careDelegations)
        .set({ status: 'pending' })
        .where(eq(schema.careDelegations.id, delegationId))

      const answers = await Effect.runPromise(
        Effect.flatMap(Absence, (absence) =>
          Effect.forEach(
            [true, false],
            (accept) =>
              Effect.exit(
                absence.respondToDelegation({
                  by: caretakerId,
                  delegationId,
                  accept,
                })
              ),
            { concurrency: 'unbounded' }
          )
        ).pipe(
          Effect.provide(
            Layer.fresh(AbsenceOnPostgresLive).pipe(
              Layer.provide(
                Layer.mergeAll(
                  CommandsLive,
                  createMockMessageQueue(),
                  createMockEventBus()
                )
              )
            )
          )
        )
      )

      const status = await currentStatus()
      expect(Arr.filter(answers, Exit.isSuccess)).toHaveLength(1)
      expect(['accepted', 'rejected']).toContain(status)
      expect(
        Arr.map(
          Arr.filter(answers, (answer) => Exit.isFailure(answer)),
          failureOf
        )
      ).toEqual([
        new DelegationInvalidStatusError({
          currentStatus: status ?? '',
          expectedStatus: 'pending',
          message: 'This delegation has already been responded to',
        }),
      ])
      expect(
        await db
          .select({ type: schema.notifications.type })
          .from(schema.notifications)
      ).toEqual([
        {
          type:
            status === 'accepted'
              ? 'delegation_accepted'
              : 'delegation_rejected',
        },
      ])
    })

    const Surroundings = Layer.mergeAll(
      CommandsLive,
      createMockMessageQueue(),
      createMockEventBus()
    )

    const holdingTheRowUntil = (
      reached: Deferred.Deferred<void>,
      release: Deferred.Deferred<void>
    ) =>
      absenceOverStore((store) => ({
        ...store,
        lockDelegation: (id) =>
          store
            .lockDelegation(id)
            .pipe(
              Effect.tap(() =>
                Effect.andThen(
                  Deferred.succeed(reached, undefined),
                  Deferred.await(release)
                )
              )
            ),
      })).pipe(Layer.provide(ManualOutboxLive), Layer.provide(Surroundings))

    const Unhindered = Layer.fresh(AbsenceOnPostgresLive).pipe(
      Layer.provide(Surroundings)
    )

    const accept = Effect.flatMap(Absence, (absence) =>
      absence.respondToDelegation({
        by: caretakerId,
        delegationId,
        accept: true,
      })
    )

    const tick = Effect.flatMap(
      Absence,
      (absence) => absence.advanceDelegations
    )

    const quietly = <A, E>(effect: Effect.Effect<A, E>) =>
      Effect.runPromiseExit(
        effect.pipe(Effect.provideService(References.MinimumLogLevel, 'None'))
      )

    const noticeTypes = async () =>
      Arr.map(
        await db
          .select({
            type: schema.notifications.type,
            userId: schema.notifications.userId,
          })
          .from(schema.notifications),
        (row) =>
          `${row.type} to ${row.userId === ownerId ? 'owner' : 'caretaker'}`
      ).sort()

    interface Race {
      readonly first: Effect.Effect<unknown, unknown, Absence>
      readonly second: Effect.Effect<unknown, unknown, Absence>
      readonly ends: 'canceled' | 'active'
      readonly firstAnswers: Exit.Exit<unknown, unknown>
      readonly secondAnswers: Exit.Exit<unknown, unknown>
      readonly tells: ReadonlyArray<string>
    }

    const RACED: Record<'the scheduler' | 'the caretaker', Race> = {
      'the scheduler': {
        first: tick,
        second: accept,
        ends: 'canceled',
        firstAnswers: Exit.succeed({ due: 1, advanced: 1, failed: 0 }),
        secondAnswers: Exit.fail(
          new DelegationInvalidStatusError({
            currentStatus: 'canceled',
            expectedStatus: 'pending',
            message: 'This delegation has already been responded to',
          })
        ),
        tells: ['delegation_canceled to owner'],
      },
      'the caretaker': {
        first: accept,
        second: tick,
        ends: 'active',
        firstAnswers: Exit.void,
        secondAnswers: Exit.succeed({ due: 1, advanced: 1, failed: 0 }),
        tells: [
          'delegation_accepted to owner',
          'delegation_activated to caretaker',
          'delegation_activated to owner',
        ],
      },
    }

    it.each(Struct.keys(RACED))(
      'ends in one status when %s reaches an unanswered request first as it lapses',
      async (winner) => {
        await db
          .update(schema.careDelegations)
          .set({ status: 'pending' })
          .where(eq(schema.careDelegations.id, delegationId))
        await db.execute(sql`TRUNCATE TABLE notifications RESTART IDENTITY`)
        const raced = RACED[winner]
        const reached = Deferred.makeUnsafe<void>()
        const release = Deferred.makeUnsafe<void>()

        const first = quietly(
          Effect.provide(raced.first, holdingTheRowUntil(reached, release))
        )
        await Effect.runPromise(Deferred.await(reached))
        const second = quietly(Effect.provide(raced.second, Unhindered))
        const secondWaited = await waitsForALock(pool, second)
        Deferred.doneUnsafe(release, Exit.void)

        expect({
          first: await first,
          second: await second,
          secondWaited,
        }).toEqual({
          first: raced.firstAnswers,
          second: raced.secondAnswers,
          secondWaited: true,
        })
        expect(await currentStatus()).toBe(raced.ends)
        expect(await noticeTypes()).toEqual(raced.tells)
      }
    )
  }
)

const injected = (message: string) =>
  Effect.fail(
    new SqlError({
      reason: new UnknownError({ cause: new Error('injected'), message }),
    })
  )

const RemindersCannotBePlanned = Layer.effect(
  NotificationRepository,
  Effect.map(NotificationRepository, (repo) => ({
    ...repo,
    lockReminders: () => injected('injected replan failure'),
  }))
)

const NotificationsCannotBeRecorded = Layer.effect(
  NotificationRepository,
  Effect.map(NotificationRepository, (repo) => ({
    ...repo,
    create: () => injected('injected notification failure'),
  }))
)

const BROKEN_WRITE = {
  fails: injected('injected write failure'),
  dies: Effect.die('injected write defect'),
} as const

const writeOf = (delegationId: string, how: keyof typeof BROKEN_WRITE) =>
  absenceOverStore((store) => ({
    ...store,
    apply: (writes) =>
      Arr.some(
        writes,
        (write) => write._tag === 'MoveDelegation' && write.id === delegationId
      )
        ? BROKEN_WRITE[how]
        : store.apply(writes),
  }))

const RequestsCannotBeStored = Layer.succeed(
  Outbox,
  Outbox.of({
    append: () => injected('injected outbox failure'),
    wake: Effect.void,
    drain: Effect.succeed(0),
    redrive: () => Effect.succeed(0),
  })
)

const ReminderServicesLive = Layer.mergeAll(
  PlantRepositoryLive,
  CareScheduleRepositoryLive,
  CareReadsLive,
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

    const run = <A, E, R>(userId: string, effect: Effect.Effect<A, E, R>) =>
      runtime.runPromise(
        effect.pipe(
          Effect.provide(
            Layer.mergeAll(
              createMockCurrentUser({ id: userId }),
              createMockMessageQueue(),
              createMockEventBus()
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        ) as Effect.Effect<A, E, Layer.Success<typeof ReminderServicesLive>>
      )

    const as = <A, E, R>(userId: string, effect: Effect.Effect<A, E, R>) =>
      run(userId, settled(effect))

    const plan = (...plantIds: ReadonlyArray<string>) =>
      as(owner, transact(Reminders.request(Dirty.Plants({ plantIds }))))

    const requests = () =>
      db
        .select({
          pendingConsumers: schema.outbox.pendingConsumers,
          processed: sql<boolean>`${schema.outbox.processedAt} is not null`,
        })
        .from(schema.outbox)
        .orderBy(asc(schema.outbox.id))

    const retryNow = () =>
      db.execute(
        sql`UPDATE outbox SET available_at = to_timestamp(0), claimed_until = NULL`
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
      const dueAt = new Date(Date.now() + 3 * DAY_MS)
      await db.insert(schema.plantCareSchedules).values({
        plantId: row.id,
        careType: 'watering',
        frequencyDays: 7,
        nextCareAt: dueAt,
        dueDay: careDayOf(dueAt),
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
      await plan(fern, ivy)
      await db.execute(sql`TRUNCATE TABLE outbox RESTART IDENTITY`)
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
      expect(await requests()).toEqual([])
    })

    it('cancels a request nobody answered by its start, tells the owner alone, once, and leaves reminders as they were', async () => {
      await db
        .update(schema.careDelegations)
        .set({ status: 'pending' })
        .where(eq(schema.careDelegations.id, toAnn))
      await db
        .update(schema.careDelegations)
        .set({ startDate: new Date(Date.now() + DAY_MS) })
        .where(eq(schema.careDelegations.id, toBen))
      const before = await pendingReminders()

      const first = await as(owner, pollAndTransition)
      const second = await as(owner, pollAndTransition)

      expect([first, second]).toEqual([
        { due: 1, advanced: 1, failed: 0 },
        { due: 0, advanced: 0, failed: 0 },
      ])
      expect(await statuses()).toEqual(['canceled', 'accepted'])
      expect(await pendingReminders()).toEqual(before)
      expect(await requests()).toEqual([])
      expect(
        await db
          .select({
            to: schema.notifications.userId,
            type: schema.notifications.type,
            body: schema.notifications.body,
            params: schema.notifications.params,
            metadata: schema.notifications.metadata,
          })
          .from(schema.notifications)
          .where(sql`${schema.notifications.status} <> 'pending'`)
      ).toEqual([
        {
          to: owner,
          type: 'delegation_canceled',
          body: "ann didn't answer in time, so the plant-sitting request was canceled",
          params: { senderName: 'ann', unanswered: true },
          metadata: { delegationId: toAnn },
        },
      ])
    })

    it('starts the delegations when their reminders cannot be planned, and hands the plants over on a later drain', async () => {
      const before = await pendingReminders()

      await run(
        owner,
        Effect.provide(settled(pollAndTransition), RemindersCannotBePlanned)
      )

      expect(await statuses()).toEqual(['active', 'active'])
      expect(await pendingReminders()).toEqual(before)
      expect(await requests()).toEqual([
        { pendingConsumers: ['reminders-absence'], processed: false },
        { pendingConsumers: ['reminders-absence'], processed: false },
      ])

      await retryNow()
      await as(owner, Effect.void)

      expect(await holders()).toEqual(['fern -> ann', 'ivy -> ben'])
      expect(await requests()).toEqual([
        { pendingConsumers: [], processed: true },
        { pendingConsumers: [], processed: true },
      ])
    })

    it.each(['fails', 'dies'] as const)(
      'starts the other delegations of a tick when the write of one %s',
      async (how) => {
        const rose = await plant('rose', owner)
        await delegate(rose, await user('cat'))
        await plan(rose)

        const tally = await as(
          owner,
          Effect.provide(pollAndTransition, writeOf(toBen, how))
        )

        expect(tally).toEqual({ due: 3, advanced: 2, failed: 1 })
        expect(await statuses()).toEqual(['active', 'accepted', 'active'])
        expect(await holders()).toEqual([
          'fern -> ann',
          'ivy -> owner',
          'rose -> cat',
        ])
      }
    )

    it('keeps a delegation active and its reminders on the caretaker when completing it cannot store the request', async () => {
      await as(owner, pollAndTransition)
      const before = await pendingReminders()

      await expect(
        as(
          owner,
          Effect.provide(
            completeDelegation(toAnn),
            Layer.fresh(AbsenceLive).pipe(Layer.provide(RequestsCannotBeStored))
          )
        )
      ).rejects.toThrow()

      expect(await statuses()).toEqual(['active', 'active'])
      expect(await pendingReminders()).toEqual(before)
    })

    it('keeps a delegation active, its reminders on the caretaker and no request when canceling it fails after the request', async () => {
      await as(owner, pollAndTransition)
      await db.execute(sql`TRUNCATE TABLE outbox RESTART IDENTITY`)
      const before = await pendingReminders()

      await expect(
        run(
          owner,
          Effect.provide(
            settled(cancelDelegation(toBen)),
            NotificationsCannotBeRecorded
          )
        )
      ).rejects.toThrow()

      expect(await statuses()).toEqual(['active', 'active'])
      expect(await pendingReminders()).toEqual(before)
      expect(await requests()).toEqual([])
    })
  }
)
