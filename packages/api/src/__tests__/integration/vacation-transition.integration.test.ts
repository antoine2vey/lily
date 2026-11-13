import {
  absenceOverStore,
  leaveOnVacation,
  returnFromVacation,
  settled,
  tickVacations,
  waitsForALock,
} from '@lily/api/__tests__/integration/absence-layers'
import { careDayOf } from '@lily/api/__tests__/integration/care-rows'
import { createStubCare } from '@lily/api/__tests__/mocks/care'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import {
  type StoredVacation,
  Vacation,
  VacationWrite,
} from '@lily/api/contexts/absence/domain/vacation'
import {
  AbsenceStore,
  AbsenceStoreLive,
  storedVacationOf,
  VacationNotSetDefect,
} from '@lily/api/contexts/absence/store'
import { CareReadsLive } from '@lily/api/contexts/care'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
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
  References,
} from 'effect'
import { SqlError, UnknownError } from 'effect/sql/SqlError'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

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

const DAY_MS = 24 * 60 * 60 * 1000

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'A vacation write on Postgres - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let userId: string

    const truncateUsers = async () => {
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    beforeEach(async () => {
      await truncateUsers()
      const [row] = await db
        .insert(schema.users)
        .values({
          email: `vacationer-${Date.now()}@example.com`,
          name: 'Vacationer',
          emailVerified: true,
          role: 'user',
          status: 'active',
        })
        .returning()
      if (!row) throw new Error('Failed to create user')
      userId = row.id
    })

    afterAll(async () => {
      await truncateUsers()
      await pool.end()
    })

    const setVacationColumns = async (
      columns: Pick<
        typeof schema.users.$inferSelect,
        'vacationStatus' | 'vacationStart' | 'vacationEnd'
      >
    ) => {
      const [row] = await db
        .update(schema.users)
        .set(columns)
        .where(eq(schema.users.id, userId))
        .returning()
      if (!row) throw new Error('Failed to set vacation columns')
      return storedVacationOf(row)
    }

    const currentVacation = async () => {
      const [row] = await db
        .select({
          vacationStatus: schema.users.vacationStatus,
          vacationStart: schema.users.vacationStart,
          vacationEnd: schema.users.vacationEnd,
        })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
      return row
    }

    const becoming = (expected: StoredVacation, next: Vacation) =>
      Effect.flatMap(AbsenceStore, (store) =>
        store.apply([VacationWrite.SetVacation({ userId, expected, next })])
      )

    const defectOf = (exit: Exit.Exit<unknown, unknown>) =>
      Exit.isFailure(exit) && Cause.squash(exit.cause)

    it('does not activate a vacation that was canceled after the read', async () => {
      const start = new Date(Date.now() - DAY_MS)
      const end = new Date(Date.now() + 6 * DAY_MS)
      const snapshot = await setVacationColumns({
        vacationStatus: 'scheduled',
        vacationStart: start,
        vacationEnd: end,
      })

      const activated = await Effect.runPromiseExit(
        Effect.andThen(
          becoming(snapshot, Vacation.None()),
          becoming(
            snapshot,
            Vacation.Active({
              start: DateTime.fromDateUnsafe(start),
              end: DateTime.fromDateUnsafe(end),
            })
          )
        ).pipe(Effect.provide(StoreLive))
      )

      expect(defectOf(activated)).toEqual(
        new VacationNotSetDefect({
          userId,
          expected: 'scheduled',
          next: 'Active',
          set: 0,
        })
      )
      expect(await currentVacation()).toEqual({
        vacationStatus: 'none',
        vacationStart: null,
        vacationEnd: null,
      })
    })

    it('does not end a vacation whose end moved after the read', async () => {
      const start = new Date(Date.now() - 7 * DAY_MS)
      const snapshot = await setVacationColumns({
        vacationStatus: 'active',
        vacationStart: start,
        vacationEnd: new Date(Date.now() - DAY_MS),
      })
      const extendedEnd = new Date(Date.now() + 5 * DAY_MS)

      const ended = await Effect.runPromiseExit(
        Effect.andThen(
          becoming(
            snapshot,
            Vacation.Active({
              start: DateTime.fromDateUnsafe(start),
              end: DateTime.fromDateUnsafe(extendedEnd),
            })
          ),
          becoming(snapshot, Vacation.None())
        ).pipe(Effect.provide(StoreLive))
      )

      expect(defectOf(ended)).toEqual(
        new VacationNotSetDefect({
          userId,
          expected: 'active',
          next: 'None',
          set: 0,
        })
      )
      const current = await currentVacation()
      expect(current?.vacationStatus).toBe('active')
      expect(current?.vacationEnd).toEqual(extendedEnd)
    })

    it('does not start a vacation that was moved to another start after the read', async () => {
      const start = new Date(Date.now() - DAY_MS)
      const end = new Date(Date.now() + 6 * DAY_MS)
      const laterStart = new Date(Date.now() + 2 * DAY_MS)
      const snapshot = await setVacationColumns({
        vacationStatus: 'scheduled',
        vacationStart: start,
        vacationEnd: end,
      })

      const started = await Effect.runPromiseExit(
        Effect.andThen(
          becoming(
            snapshot,
            Vacation.Scheduled({
              start: DateTime.fromDateUnsafe(laterStart),
              end: DateTime.fromDateUnsafe(end),
            })
          ),
          becoming(
            snapshot,
            Vacation.Active({
              start: DateTime.fromDateUnsafe(start),
              end: DateTime.fromDateUnsafe(end),
            })
          )
        ).pipe(Effect.provide(StoreLive))
      )

      expect(defectOf(started)).toEqual(
        new VacationNotSetDefect({
          userId,
          expected: 'scheduled',
          next: 'Active',
          set: 0,
        })
      )
      expect(await currentVacation()).toEqual({
        vacationStatus: 'scheduled',
        vacationStart: laterStart,
        vacationEnd: end,
      })
    })

    it('does not call off a vacation that started after the read', async () => {
      const start = new Date(Date.now() - DAY_MS)
      const end = new Date(Date.now() + 6 * DAY_MS)
      const snapshot = await setVacationColumns({
        vacationStatus: 'scheduled',
        vacationStart: start,
        vacationEnd: end,
      })

      const calledOff = await Effect.runPromiseExit(
        Effect.andThen(
          becoming(
            snapshot,
            Vacation.Active({
              start: DateTime.fromDateUnsafe(start),
              end: DateTime.fromDateUnsafe(end),
            })
          ),
          becoming(snapshot, Vacation.None())
        ).pipe(Effect.provide(StoreLive))
      )

      expect(defectOf(calledOff)).toEqual(
        new VacationNotSetDefect({
          userId,
          expected: 'scheduled',
          next: 'None',
          set: 0,
        })
      )
      expect(await currentVacation()).toEqual({
        vacationStatus: 'active',
        vacationStart: start,
        vacationEnd: end,
      })
    })

    it('asks Care to move the due days of living plants only', async () => {
      const rated = {
        userId,
        createdByUserId: userId,
        health: 'HEALTHY' as const,
        humidityRating: 3,
        lightingRating: 3,
        petToxicityRating: 1,
        wateringRating: 3,
      }
      const [living, dead] = await db
        .insert(schema.plants)
        .values([
          { ...rated, name: 'Living' },
          { ...rated, name: 'Buried', diedAt: new Date('2026-01-01') },
        ])
        .returning()
      if (!living || !dead) throw new Error('Failed to create plants')
      const care = createStubCare()
      const endedAt = DateTime.makeUnsafe(Date.now() - DAY_MS)

      await Effect.runPromise(
        Effect.flatMap(AbsenceStore, (store) =>
          store.apply([
            VacationWrite.MoveDueDaysAfterAbsence({ userId, endedAt, days: 7 }),
          ])
        ).pipe(
          Effect.provide(
            AbsenceStoreLive.pipe(
              Layer.provide(
                Layer.mergeAll(
                  CanopyRepositoryLive,
                  NotificationRepositoryLive,
                  care.layer
                )
              ),
              Layer.provideMerge(DrizzleLive),
              Layer.provideMerge(PgLive)
            )
          )
        )
      )

      expect(
        Arr.dedupe(
          Arr.flatMap(care.moved, (command) =>
            Arr.map(command.moves, (move) => move.plantId)
          )
        )
      ).toEqual([living.id])
    })
  }
)

const VacationServicesLive = Layer.mergeAll(
  PlantRepositoryLive,
  UserRepositoryLive,
  CareScheduleRepositoryLive,
  CareReadsLive,
  DelegationRepositoryLive,
  CanopyRepositoryLive,
  NotificationRepositoryLive,
  createMockEventBus(),
  createMockMessageQueue(),
  createMockWeatherProvider(),
  createMockWeatherCache(),
  createMockWeatherRepository()
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const BROKEN_WRITE = {
  fails: Effect.fail(
    new SqlError({
      reason: new UnknownError({
        cause: new Error('injected'),
        message: 'injected write failure',
      }),
    })
  ),
  dies: Effect.die('injected write defect'),
} as const

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Vacation commands on Postgres - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    const names = new Map<string, string>()

    const user = async (
      name: string,
      vacation: Pick<
        typeof schema.users.$inferInsert,
        'vacationStatus' | 'vacationStart' | 'vacationEnd'
      >
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
          ...vacation,
        })
        .returning()
      if (!row) throw new Error(`Failed to create ${name}`)
      names.set(row.id, name)
      return row
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

    const resetDb = async () => {
      for (const table of [
        'outbox',
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
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    beforeEach(resetDb)

    afterAll(async () => {
      await resetDb()
      await pool.end()
    })

    const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.runPromiseExit(
        settled(effect).pipe(
          Effect.provide(VacationServicesLive),
          Effect.provideService(References.MinimumLogLevel, 'None')
        ) as Effect.Effect<A, E>
      )

    const statusOf = async (userId: string) => {
      const [row] = await db
        .select({ vacationStatus: schema.users.vacationStatus })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
      return row?.vacationStatus
    }

    const said = async () => {
      const rows = await db
        .select({ event: schema.outbox.event })
        .from(schema.outbox)
        .where(eq(schema.outbox.topic, 'absence'))
        .orderBy(asc(schema.outbox.id))
      return Arr.map(rows, (row) => {
        const event = row.event as { _tag: string; userId: string }
        return `${event._tag} ${names.get(event.userId)}`
      })
    }

    const dueToStart = {
      vacationStatus: 'scheduled',
      vacationStart: new Date(Date.now() - DAY_MS),
      vacationEnd: new Date(Date.now() + 6 * DAY_MS),
    } as const

    it('starts a vacation once when a set and the scheduler reach it at once', async () => {
      const ann = await user('ann', dueToStart)
      const reached = Deferred.makeUnsafe<void>()
      const release = Deferred.makeUnsafe<void>()
      const setting = run(
        Effect.provide(
          leaveOnVacation(ann.id, {
            start: dueToStart.vacationStart,
            end: dueToStart.vacationEnd,
          }),
          absenceOverStore((store) => ({
            ...store,
            lockVacation: (userId, now) =>
              store
                .lockVacation(userId, now)
                .pipe(
                  Effect.tap(() =>
                    Effect.andThen(
                      Deferred.succeed(reached, undefined),
                      Deferred.await(release)
                    )
                  )
                ),
          }))
        )
      )
      await Effect.runPromise(Deferred.await(reached))
      const ticking = run(tickVacations)
      const tickWaited = await waitsForALock(pool, ticking)
      Deferred.doneUnsafe(release, Exit.void)

      expect({
        set: Exit.isSuccess(await setting),
        tick: await ticking,
        tickWaited,
      }).toEqual({
        set: true,
        tick: Exit.succeed({ due: 1, advanced: 0, failed: 0 }),
        tickWaited: true,
      })
      expect(await statusOf(ann.id)).toBe('active')
      expect(await said()).toEqual(['VacationStarted ann'])
    })

    it.each(['fails', 'dies'] as const)(
      'counts a user whose vacation write %s and still starts the next',
      async (how) => {
        const [first, second] = Arr.sort(
          [await user('ann', dueToStart), await user('bob', dueToStart)],
          (a: { id: string }, b: { id: string }) =>
            a.id < b.id ? -1 : a.id > b.id ? 1 : 0
        )
        if (!first || !second) throw new Error('Failed to create users')

        const tally = await run(
          Effect.provide(
            tickVacations,
            absenceOverStore((store) => ({
              ...store,
              apply: (writes) =>
                Arr.some(
                  writes,
                  (write) =>
                    write._tag === 'SetVacation' && write.userId === first.id
                )
                  ? BROKEN_WRITE[how]
                  : store.apply(writes),
            }))
          )
        )

        expect(tally).toEqual(Exit.succeed({ due: 2, advanced: 1, failed: 1 }))
        expect(await statusOf(first.id)).toBe('scheduled')
        expect(await statusOf(second.id)).toBe('active')
        expect(await said()).toEqual([
          `VacationStarted ${names.get(second.id)}`,
        ])
      }
    )

    it('neither lists nor starts the due vacation of an account that is not active', async () => {
      const ann = await user('ann', dueToStart)
      await db
        .update(schema.users)
        .set({ status: 'suspended' })
        .where(eq(schema.users.id, ann.id))

      const tally = await run(tickVacations)

      expect(tally).toEqual(Exit.succeed({ due: 0, advanced: 0, failed: 0 }))
      expect(await statusOf(ann.id)).toBe('scheduled')
      expect(await said()).toEqual([])
    })

    it('moves only the due days of the living plants of who comes back that no reachable caretaker tends', async () => {
      const ann = await user('ann', {
        vacationStatus: 'active',
        vacationStart: new Date(Date.now() - 5 * DAY_MS),
        vacationEnd: new Date(Date.now() + 2 * DAY_MS),
      })
      const bob = await user('bob', { vacationStatus: 'none' })
      const gone = await user('gone', { vacationStatus: 'none' })
      await db
        .update(schema.users)
        .set({ status: 'pending_deletion' })
        .where(eq(schema.users.id, gone.id))
      const dueWhileAway = new Date(Date.now() - 2 * DAY_MS)
      const dueWhileAwayPlant = async (name: string, ownerId: string) => {
        const id = await plant(name, ownerId)
        await db
          .update(schema.plantCareSchedules)
          .set({ nextCareAt: dueWhileAway, dueDay: careDayOf(dueWhileAway) })
          .where(eq(schema.plantCareSchedules.plantId, id))
        return id
      }
      const handedTo = async (
        plantId: string,
        status: 'active' | 'completed',
        caretakerId = bob.id
      ) => {
        const [delegation] = await db
          .insert(schema.careDelegations)
          .values({
            ownerId: ann.id,
            caretakerId,
            status,
            startDate: new Date(Date.now() - 4 * DAY_MS),
            endDate: new Date(Date.now() + 30 * DAY_MS),
          })
          .returning()
        if (!delegation) throw new Error('Failed to create delegation')
        await db
          .insert(schema.delegationPlants)
          .values({ delegationId: delegation.id, plantId })
      }
      await dueWhileAwayPlant('own', ann.id)
      await handedTo(await dueWhileAwayPlant('tended', ann.id), 'active')
      await handedTo(
        await dueWhileAwayPlant('handed back', ann.id),
        'completed'
      )
      await handedTo(
        await dueWhileAwayPlant('tended by an account that is gone', ann.id),
        'active',
        gone.id
      )
      const buried = await dueWhileAwayPlant('buried', ann.id)
      await db
        .update(schema.plants)
        .set({ diedAt: new Date() })
        .where(eq(schema.plants.id, buried))
      await dueWhileAwayPlant('of a neighbour', bob.id)

      expect(await run(returnFromVacation(ann.id))).toEqual(Exit.void)

      const schedules = await db
        .select({
          plantId: schema.plantCareSchedules.plantId,
          nextCareAt: schema.plantCareSchedules.nextCareAt,
        })
        .from(schema.plantCareSchedules)
      expect(
        Arr.sort(
          Arr.map(
            Arr.filter(
              schedules,
              (schedule) =>
                schedule.nextCareAt?.getTime() !== dueWhileAway.getTime()
            ),
            (schedule) => names.get(schedule.plantId) ?? ''
          ),
          (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
        )
      ).toEqual(['handed back', 'own', 'tended by an account that is gone'])
    })

    it('gives a caretaker back the reminders of the plants they care for', async () => {
      const owner = await user('owner', { vacationStatus: 'none' })
      const ann = await user('ann', {
        vacationStatus: 'active',
        vacationStart: new Date(Date.now() - 2 * DAY_MS),
        vacationEnd: new Date(Date.now() + 2 * DAY_MS),
      })
      const fern = await plant('fern', owner.id)
      await plant('moss', ann.id)
      const [delegation] = await db
        .insert(schema.careDelegations)
        .values({
          ownerId: owner.id,
          caretakerId: ann.id,
          status: 'active',
          startDate: new Date(Date.now() - 3 * DAY_MS),
          endDate: new Date(Date.now() + 30 * DAY_MS),
        })
        .returning()
      if (!delegation) throw new Error('Failed to create delegation')
      await db
        .insert(schema.delegationPlants)
        .values({ delegationId: delegation.id, plantId: fern })

      expect(await run(returnFromVacation(ann.id))).toEqual(Exit.void)

      const rows = await db
        .select({
          userId: schema.notifications.userId,
          plantId: schema.notifications.plantId,
        })
        .from(schema.notifications)
        .where(sql`${schema.notifications.status} = 'pending'`)
      expect(
        Arr.sort(
          Arr.map(
            rows,
            (row) =>
              `${names.get(row.plantId ?? '')} -> ${names.get(row.userId)}`
          ),
          (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
        )
      ).toEqual(['fern -> ann', 'moss -> ann'])
    })
  }
)
