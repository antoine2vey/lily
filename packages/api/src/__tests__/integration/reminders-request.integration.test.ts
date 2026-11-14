import { careDayOf } from '@lily/api/__tests__/integration/care-rows'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { transactInMemory } from '@lily/api/__tests__/mocks/transaction'
import { CareReadsLive, CareTopic } from '@lily/api/contexts/care'
import {
  Dirty,
  Reminders,
  redriveReminders,
  repairDrift,
} from '@lily/api/contexts/reminders'
import { replan } from '@lily/api/contexts/reminders/replan'
import { makeOutbox, Outbox, type RelayConfig } from '@lily/api/kernel/outbox'
import type { Transaction } from '@lily/api/kernel/transact'
import { transact } from '@lily/api/kernel/transact'
import { type AppConsumersContext, appConsumers } from '@lily/api/layers/outbox'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { auditReminders } from '@lily/api/services/reminders-audit/scheduler'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { CareDays } from '@lily/shared'
import { asc, type SQL, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, DateTime, Effect, Layer, Option, Ref, References } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
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

const StoreLive = Layer.mergeAll(
  CareReadsLive,
  CanopyRepositoryLive,
  NotificationRepositoryLive,
  PlantRepositoryLive,
  UserRepositoryLive,
  DelegationRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const appLayer = (relay: Partial<RelayConfig>) =>
  Layer.effect(
    Outbox,
    Effect.gen(function* () {
      const context = yield* Effect.context<AppConsumersContext>()
      const { service } = yield* makeOutbox(appConsumers(context), relay)
      return service
    })
  ).pipe(Layer.provideMerge(Layer.mergeAll(StoreLive, createMockEventBus())))

const run = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    Layer.Success<ReturnType<typeof appLayer>> | Transaction
  >,
  relay: Partial<RelayConfig> = {}
) =>
  Effect.runPromise(
    effect.pipe(
      transactInMemory,
      Effect.provide(Layer.fresh(appLayer(relay))),
      Effect.provideService(References.MinimumLogLevel, 'None')
    )
  )

const drain = Effect.flatMap(Outbox, (outbox) => outbox.drain)

const DAY_MS = 86_400_000

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Reminder requests and audit - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let alex: string
    let sam: string
    let canopyId: string

    const user = async (name: string) => {
      const [row] = await db
        .insert(schema.users)
        .values({
          email: `${name.toLowerCase()}-${Date.now()}@example.com`,
          name: `${name} ${Date.now()}`,
          emailVerified: true,
          role: 'user',
          status: 'active',
          timezone: 'UTC',
          preferredNotificationTime: '09:00',
        })
        .returning()
      if (!row) throw new Error(`Failed to create ${name}`)
      return row.id
    }

    const plants = async (
      owner: { userId: string } | { canopyId: string },
      names: ReadonlyArray<string>,
      dueInDays = 1
    ) => {
      const rows = await db
        .insert(schema.plants)
        .values(
          Array.map(names, (name) => ({
            ...owner,
            createdByUserId: alex,
            name,
            health: 'HEALTHY' as const,
            humidityRating: 3,
            lightingRating: 3,
            petToxicityRating: 1,
            wateringRating: 3,
          }))
        )
        .returning({ id: schema.plants.id })
      const dueAt = new Date(Date.now() + dueInDays * DAY_MS)
      await db.insert(schema.plantCareSchedules).values(
        Array.map(rows, (row) => ({
          plantId: row.id,
          careType: 'watering' as const,
          frequencyDays: 7,
          nextCareAt: dueAt,
          dueDay: careDayOf(dueAt),
        }))
      )
      return Array.map(rows, (row) => row.id)
    }

    const plant = async (
      owner: { userId: string } | { canopyId: string },
      name: string,
      dueInDays = 1
    ) => {
      const [id] = await plants(owner, [name], dueInDays)
      if (id === undefined) throw new Error(`Failed to create plant ${name}`)
      return id
    }

    const dayIn = (days: number) =>
      CareDays.of(
        DateTime.makeUnsafe(new Date(Date.now() + days * DAY_MS)),
        'UTC'
      )
    const tomorrow = () => dayIn(1)

    const reminders = async () =>
      Array.map(
        await db
          .select({
            userId: schema.notifications.userId,
            plantId: schema.notifications.plantId,
            occasionDay: schema.notifications.occasionDay,
          })
          .from(schema.notifications),
        (row) => [row.userId, row.plantId, row.occasionDay]
      ).sort()

    const requests = () =>
      db
        .select({
          topic: schema.outbox.topic,
          pendingConsumers: schema.outbox.pendingConsumers,
          processed: sql<boolean>`${schema.outbox.processedAt} is not null`,
          lastError: schema.outbox.lastError,
        })
        .from(schema.outbox)
        .orderBy(asc(schema.outbox.id))

    const retryNow = () =>
      db.execute(
        sql`UPDATE outbox SET available_at = to_timestamp(0), claimed_until = NULL`
      )

    const whileRemindersCannotBeWritten = async <A>(
      body: () => Promise<A>,
      when: SQL = sql`true`
    ) => {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION refuse_reminder() RETURNS trigger AS $$
        BEGIN RAISE EXCEPTION 'reminders cannot be written'; END;
        $$ LANGUAGE plpgsql
      `)
      await db.execute(sql`
        CREATE TRIGGER refuse_reminder BEFORE INSERT ON notifications
        FOR EACH ROW WHEN (${when}) EXECUTE FUNCTION refuse_reminder()
      `)
      try {
        return await body()
      } finally {
        await db.execute(sql`DROP TRIGGER refuse_reminder ON notifications`)
        await db.execute(sql`DROP FUNCTION refuse_reminder()`)
      }
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    beforeEach(async () => {
      for (const table of [
        'outbox',
        'dead_letter_messages',
        'notifications',
        'plant_care_schedules',
        'plants',
        'canopy_plant_mutes',
        'canopy_members',
        'canopies',
        'users',
      ]) {
        await db.execute(
          sql.raw(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`)
        )
      }
      alex = await user('Alex')
      sam = await user('Sam')
      const [canopy] = await db
        .insert(schema.canopies)
        .values({ name: 'Flat', timezone: 'UTC' })
        .returning()
      if (!canopy) throw new Error('Failed to create canopy')
      canopyId = canopy.id
      await db.insert(schema.canopyMembers).values([
        { canopyId, userId: alex, role: 'owner' },
        { canopyId, userId: sam, role: 'member' },
      ])
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    afterAll(async () => {
      await pool.end()
    })

    describe('request', () => {
      it('plans nothing for a request whose transaction rolled back', async () => {
        const fern = await plant({ userId: sam }, 'Fern')

        const claimed = await run(
          Effect.gen(function* () {
            const sqlClient = yield* SqlClient.SqlClient
            yield* sqlClient
              .withTransaction(
                Effect.andThen(
                  Reminders.request(Dirty.Plants({ plantIds: [fern] })),
                  Effect.fail('refused' as const)
                )
              )
              .pipe(Effect.exit)
            return yield* drain
          })
        )

        expect(claimed).toBe(0)
        expect(await requests()).toEqual([])
        expect(await reminders()).toEqual([])
      })

      it('plans a committed request of each kind once the relay delivers it, not before', async () => {
        const fern = await plant({ userId: sam }, 'Fern')
        const ivy = await plant({ userId: alex }, 'Ivy')
        const monstera = await plant({ canopyId }, 'Monstera')
        await plant({ userId: sam }, 'Pothos')

        await run(
          transact(
            Reminders.request(
              Dirty.Plants({ plantIds: [fern] }),
              Dirty.Recipient({ userId: alex }),
              Dirty.Canopy({ canopyId })
            )
          )
        )
        const before = await reminders()
        const claimed = await run(drain)

        expect(before).toEqual([])
        expect(claimed).toBe(3)
        expect(await reminders()).toEqual(
          [
            [sam, fern, tomorrow()],
            [alex, ivy, tomorrow()],
            [alex, monstera, tomorrow()],
            [sam, monstera, tomorrow()],
          ].sort()
        )
        expect(await requests()).toEqual(
          Array.makeBy(3, () => ({
            topic: 'reminders',
            pendingConsumers: [],
            processed: true,
            lastError: null,
          }))
        )
      })

      it('keeps a request whose replan failed and plans it on a later drain', async () => {
        const fern = await plant({ userId: sam }, 'Fern')

        await whileRemindersCannotBeWritten(() =>
          run(
            Effect.andThen(
              transact(Reminders.request(Dirty.Plants({ plantIds: [fern] }))),
              drain
            )
          )
        )

        expect(await reminders()).toEqual([])
        expect(await requests()).toEqual([
          {
            topic: 'reminders',
            pendingConsumers: ['reminders-replan'],
            processed: false,
            lastError: expect.stringContaining('reminders cannot be written'),
          },
        ])

        await retryNow()
        await run(drain)

        expect(await reminders()).toEqual([[sam, fern, tomorrow()]])
        expect(await requests()).toMatchObject([
          { pendingConsumers: [], processed: true },
        ])
      })
    })

    describe('replan', () => {
      const names = (count: number) =>
        Array.makeBy(count, (index) => `Plant ${index}`)

      it('returns how many changes it made, and none the second time', async () => {
        const ids = await plants({ userId: sam }, names(51))

        const first = await run(replan(Dirty.Plants({ plantIds: ids })))
        const second = await run(replan(Dirty.Plants({ plantIds: ids })))

        expect([first, second]).toEqual([51, 0])
        expect(await reminders()).toHaveLength(51)
      })

      it('commits fifty plants at a time: a failure keeps the chunks before it', async () => {
        const ids = await plants({ userId: sam }, names(51))
        const last = ids[50]

        const exit = await whileRemindersCannotBeWritten(
          () =>
            run(Effect.exit(replan(Dirty.Recipient({ userId: sam })))).then(
              (result) => result._tag
            ),
          sql.raw(`NEW.plant_id = '${last}'`)
        )

        expect(exit).toBe('Failure')
        const planned = Array.map(await reminders(), ([, plantId]) => plantId)
        expect(planned).toHaveLength(50)
        expect(planned).not.toContain(last)
      })
    })

    describe('audit', () => {
      const oneAttempt = { maxAttempts: 1 }
      const deadLetters = async () => {
        const [row] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.deadLetterMessages)
        return row?.count
      }
      const beforeTheDailyPass = () => {
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(
          new Date(`${new Date().toISOString().slice(0, 10)}T02:30:00Z`)
        )
      }

      const sinceStartup = () => Effect.runSync(Ref.make(Option.none<string>()))

      it('gives the request and the Care event Reminders dead-lettered another round', async () => {
        beforeTheDailyPass()
        const fern = await plant({ userId: sam }, 'Fern')
        const ivy = await plant({ userId: sam }, 'Ivy')

        await whileRemindersCannotBeWritten(() =>
          run(
            Effect.gen(function* () {
              const outbox = yield* Outbox
              yield* Reminders.request(Dirty.Plants({ plantIds: [fern] }))
              yield* outbox.append(CareTopic, [
                {
                  _tag: 'ScheduleChanged',
                  plantId: ivy,
                  careType: 'watering',
                  dueDay: tomorrow(),
                  reason: 'frequency',
                },
              ])
              yield* drain
            }),
            oneAttempt
          )
        )
        const dead = await deadLetters()
        const afterDeath = await run(drain, oneAttempt)

        expect(dead).toBe(2)
        expect(afterDeath).toBe(0)
        expect(await reminders()).toEqual([])

        await run(
          Effect.andThen(auditReminders(sinceStartup()), drain),
          oneAttempt
        )

        expect(await reminders()).toEqual(
          [
            [sam, fern, tomorrow()],
            [sam, ivy, tomorrow()],
          ].sort()
        )
      })

      it('redrives what died within the last day and leaves older dead', async () => {
        const [fern, ivy] = await plants({ userId: sam }, ['Fern', 'Ivy'])
        if (fern === undefined || ivy === undefined) throw new Error('plants')
        await whileRemindersCannotBeWritten(() =>
          run(
            Effect.andThen(
              Reminders.request(
                Dirty.Plants({ plantIds: [fern] }),
                Dirty.Plants({ plantIds: [ivy] })
              ),
              drain
            ),
            oneAttempt
          )
        )
        const hoursAgo = (hours: number) =>
          new Date(Date.now() - hours * 3_600_000).toISOString()
        await db.execute(sql`
          UPDATE outbox SET created_at = CASE
            WHEN event->'plantIds'->>0 = ${fern} THEN ${hoursAgo(23)}::timestamptz
            ELSE ${hoursAgo(25)}::timestamptz END
        `)

        const redriven = await run(redriveReminders, oneAttempt)
        await run(drain, oneAttempt)

        expect(redriven).toBe(1)
        expect(await reminders()).toEqual([[sam, fern, tomorrow()]])
      })

      it('reports no drift on reminders that match the rule', async () => {
        const soon = await plant({ userId: sam }, 'Soon', 2)
        const later = await plant({ userId: sam }, 'Later', 3)
        await run(replan(Dirty.Plants({ plantIds: [soon, later] })))

        const report = await run(repairDrift)

        expect(report).toEqual({ plants: 1, drift: 0 })
        expect(await reminders()).toHaveLength(2)
      })

      it('writes back a row deleted behind its back, counts it, and leaves a care due later alone', async () => {
        const soon = await plant({ userId: sam }, 'Soon', 2)
        const later = await plant({ userId: sam }, 'Later', 3)
        await run(replan(Dirty.Plants({ plantIds: [soon, later] })))
        await db.execute(sql`DELETE FROM notifications`)

        const report = await run(repairDrift)

        expect(report).toEqual({ plants: 1, drift: 1 })
        expect(await reminders()).toEqual([[sam, soon, dayIn(2)]])
      })

      it('runs the daily pass once a day, on the first tick from 03:00 UTC', async () => {
        beforeTheDailyPass()
        const fern = await plant({ userId: sam }, 'Fern')
        const lastPassDay = sinceStartup()

        await run(auditReminders(lastPassDay))
        const beforeThePass = await reminders()
        vi.setSystemTime(Date.now() + 3_600_000)
        await run(auditReminders(lastPassDay))
        const afterThePass = await reminders()
        await db.execute(sql`DELETE FROM notifications`)
        vi.setSystemTime(Date.now() + 3_600_000)
        await run(auditReminders(lastPassDay))

        expect(beforeThePass).toEqual([])
        expect(afterThePass).toEqual([[sam, fern, tomorrow()]])
        expect(await reminders()).toEqual([])
      })
    })
  }
)
