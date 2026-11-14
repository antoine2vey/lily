import {
  CareOnPostgresLive,
  drainOutbox,
} from '@lily/api/__tests__/integration/care-layers'
import { careDayOf } from '@lily/api/__tests__/integration/care-rows'
import { carePermit } from '@lily/api/__tests__/mocks/care'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import {
  Care,
  CareReadsLive,
  CareWhen,
  DueMove,
  frequencyOfDays,
  PlanStepChoice,
  type RecordOutcome,
} from '@lily/api/contexts/care'
import { Actor, mintPermit } from '@lily/api/kernel/permit'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import {
  PlantRepository,
  PlantRepositoryLive,
} from '@lily/api/repositories/plant.repository'
import { RoomRepositoryLive } from '@lily/api/repositories/room.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { updatePlant } from '@lily/api/services/plants/endpoints/update-plant'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { CareDays } from '@lily/shared'
import type { AppEvent } from '@lily/shared/server'
import { GCSService } from '@lily/shared/services/file/gcs'
import { asc, count, eq, inArray, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, DateTime, Effect, Layer, Option, pipe, Result } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const RepositoriesLive = Layer.mergeAll(
  PlantRepositoryLive,
  CareScheduleRepositoryLive,
  CareReadsLive,
  NotificationRepositoryLive,
  UserRepositoryLive,
  CanopyRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const careLayer = (publishedEvents: AppEvent[] = []) =>
  CareOnPostgresLive.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        RepositoriesLive,
        createMockDelegationRepository({}),
        createMockEventBus({ publishedEvents }),
        createMockWeatherProvider(),
        createMockWeatherCache(),
        createMockWeatherRepository()
      )
    )
  )

const ratings = {
  health: 'HEALTHY' as const,
  humidityRating: 3,
  lightingRating: 3,
  petToxicityRating: 1,
  wateringRating: 3,
}

const waterToday = {
  careType: 'watering' as const,
  on: CareWhen.Today(),
  notes: Option.none(),
  photoUrl: Option.none(),
  planStep: PlanStepChoice.Auto(),
}

const summary = (outcomes: ReadonlyArray<RecordOutcome>) =>
  Array.map(outcomes, (outcome) =>
    outcome._tag === 'Skipped' ? outcome.reason._tag : outcome._tag
  )

describe.skipIf(!process.env.DATABASE_URL_TEST)('Care - Integration', () => {
  let pool: pg.Pool
  let db: ReturnType<typeof drizzle>
  let userId: string

  const addPlant = async (
    name: string,
    nextCareAt: Date = new Date(),
    owner: Partial<typeof schema.plants.$inferInsert> = {}
  ) => {
    const [plant] = await db
      .insert(schema.plants)
      .values({ ...ratings, name, userId, ...owner })
      .returning()
    if (!plant) throw new Error('plant insert failed')
    await db.insert(schema.plantCareSchedules).values({
      plantId: plant.id,
      careType: 'watering',
      frequencyDays: 7,
      nextCareAt,
      dueDay: careDayOf(nextCareAt),
    })
    return plant.id
  }

  const logsOf = (plantIds: ReadonlyArray<string>) =>
    db
      .select({
        plantId: schema.careLogs.plantId,
        by: schema.careLogs.performedByUserId,
      })
      .from(schema.careLogs)
      .where(inArray(schema.careLogs.plantId, [...plantIds]))

  const scheduleOf = async (plantId: string) => {
    const [schedule] = await db
      .select()
      .from(schema.plantCareSchedules)
      .where(eq(schema.plantCareSchedules.plantId, plantId))
    return schedule
  }

  const remindersOf = (plantId: string) =>
    db
      .select({
        type: schema.notifications.type,
        scheduledAt: schema.notifications.scheduledAt,
      })
      .from(schema.notifications)
      .where(eq(schema.notifications.plantId, plantId))
      .orderBy(asc(schema.notifications.type))

  const pendingEvents = async () => {
    const [row] = await db
      .select({ count: count() })
      .from(schema.outbox)
      .where(sql`${schema.outbox.processedAt} is null`)
    return row?.count
  }

  const run = <A, E>(
    effect: Effect.Effect<A, E, Layer.Success<ReturnType<typeof careLayer>>>,
    publishedEvents: AppEvent[] = []
  ) =>
    Effect.runPromise(effect.pipe(Effect.provide(careLayer(publishedEvents))))

  const water = (plantId: string) =>
    Effect.flatMap(Care, (care) =>
      care.recordOne({ ...waterToday, permit: carePermit(plantId, userId) })
    )

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
    db = drizzle(pool, { schema })
  })

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE TABLE outbox RESTART IDENTITY`)
    await db.execute(sql`TRUNCATE TABLE plants RESTART IDENTITY CASCADE`)
    await db.execute(sql`TRUNCATE TABLE canopies RESTART IDENTITY CASCADE`)
    await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
    const [user] = await db
      .insert(schema.users)
      .values({
        email: 'care-record@example.com',
        name: 'Care Record User',
        emailVerified: true,
        timezone: 'UTC',
      })
      .returning()
    if (!user) throw new Error('user insert failed')
    userId = user.id
  })

  afterAll(async () => {
    await pool.end()
  })

  it('writes one care log when two requests care for the same plant at once', async () => {
    const plantId = await addPlant('Race Plant')
    const publishedEvents: AppEvent[] = []

    const results = await run(
      Effect.all(
        [
          water(plantId).pipe(Effect.result),
          water(plantId).pipe(Effect.result),
        ],
        { concurrency: 'unbounded' }
      ).pipe(Effect.tap(() => drainOutbox)),
      publishedEvents
    )

    expect(
      Array.map(results, (result) =>
        Result.isSuccess(result) ? 'Recorded' : result.failure._tag
      ).sort()
    ).toEqual(['AlreadyCaredTodayError', 'Recorded'])
    expect(await logsOf([plantId])).toEqual([{ plantId, by: userId }])
    expect(
      Array.filter(publishedEvents, (e) => e._tag === 'CareLogCreated')
    ).toHaveLength(1)
  })

  it('does not deadlock when a bulk care and single cares overlap', async () => {
    const plantIds = await Promise.all(
      Array.map(Array.range(1, 6), (i) => addPlant(`Plant ${i}`))
    )
    const bulk = (ids: ReadonlyArray<string>) =>
      Effect.flatMap(Care, (care) =>
        care.record({
          ...waterToday,
          permits: Array.map(ids, (id) => carePermit(id, userId)),
        })
      )

    const [forward, backward] = await run(
      Effect.all(
        [
          bulk(plantIds),
          bulk(Array.reverse(plantIds)),
          ...Array.map(plantIds, (id) => water(id).pipe(Effect.result)),
        ],
        { concurrency: 'unbounded' }
      )
    )

    expect(Array.length(forward ?? [])).toBe(6)
    expect(Array.length(backward ?? [])).toBe(6)
    const logs = await logsOf(plantIds)
    expect(Array.map(logs, (log) => log.plantId).sort()).toEqual(
      [...plantIds].sort()
    )
  })

  it('skips a dead plant and a deleted plant without failing the others', async () => {
    const alive = await addPlant('Alive')
    const dead = await addPlant('Dead', undefined, {
      diedAt: new Date(),
      deathCause: 'unknown',
    })
    const gone = crypto.randomUUID()

    const outcomes = await run(
      Effect.flatMap(Care, (care) =>
        care.record({
          ...waterToday,
          permits: Array.map([alive, dead, gone], (id) =>
            carePermit(id, userId)
          ),
        })
      )
    )

    expect(
      Object.fromEntries(
        Array.map(outcomes, (outcome) => [
          outcome.plantId,
          summary([outcome])[0],
        ])
      )
    ).toEqual({ [alive]: 'Recorded', [dead]: 'Dead', [gone]: 'PlantGone' })
    expect(await logsOf([alive, dead])).toEqual([
      { plantId: alive, by: userId },
    ])
  })

  it('moves the due day to the care day plus the frequency, at midnight of the care timezone', async () => {
    await db
      .update(schema.users)
      .set({ timezone: 'Europe/Paris' })
      .where(eq(schema.users.id, userId))
    const plantId = await addPlant('Paris Plant')

    const recorded = await run(water(plantId))

    const schedule = await scheduleOf(plantId)
    const dueDay = CareDays.addDays(recorded.day, 7)
    expect(recorded.dueDay).toEqual(Option.some(dueDay))
    expect(schedule?.nextCareAt).toEqual(
      DateTime.toDateUtc(CareDays.startOf(dueDay, 'Europe/Paris'))
    )
    expect(schedule?.lastCareAt).toBeInstanceOf(Date)
  })

  it('counts a Canopy plant day in the Canopy timezone, not the acting member', async () => {
    const [canopy] = await db
      .insert(schema.canopies)
      .values({ name: 'Flat', timezone: 'Pacific/Auckland' })
      .returning()
    if (!canopy) throw new Error('canopy insert failed')
    const shared = await addPlant('Shared Fern', undefined, {
      userId: null,
      canopyId: canopy.id,
    })
    const careAt = (iso: string) =>
      Effect.flatMap(Care, (care) =>
        care.recordOne({
          ...waterToday,
          on: CareWhen.At({ instant: DateTime.makeUnsafe(iso) }),
          permit: carePermit(shared, userId),
        })
      ).pipe(Effect.result)

    const [morning, afternoon] = await run(
      Effect.all([
        careAt('2026-10-20T20:00:00.000Z'),
        careAt('2026-10-21T02:00:00.000Z'),
      ])
    )

    expect(Result.isSuccess(morning)).toBe(true)
    expect(
      pipe(
        Option.some(afternoon),
        Option.filter(Result.isFailure),
        Option.map((r) => r.failure._tag),
        Option.getOrNull
      )
    ).toBe('AlreadyCaredTodayError')
  })

  it('completes the earliest open step of an accepted care plan and settles the plan', async () => {
    const plantId = await addPlant('Planned')
    const [plan] = await db
      .insert(schema.carePlans)
      .values({ plantId, userId, title: 'Recover', status: 'accepted' })
      .returning()
    if (!plan) throw new Error('plan insert failed')
    const [step] = await db
      .insert(schema.carePlanSteps)
      .values({
        planId: plan.id,
        position: 0,
        title: 'Water now',
        careType: 'watering',
      })
      .returning()

    const recorded = await run(water(plantId))

    const [after] = await db
      .select()
      .from(schema.carePlanSteps)
      .where(eq(schema.carePlanSteps.id, step?.id ?? ''))
    const [settled] = await db
      .select({ status: schema.carePlans.status })
      .from(schema.carePlans)
      .where(eq(schema.carePlans.id, plan.id))
    expect(after?.careLogId).toBe(recorded.careLogId)
    expect(after?.completedAt).toBeInstanceOf(Date)
    expect(settled?.status).toBe('completed')
  })

  describe('editing history', () => {
    const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000)
    const dayOf = (date: Date) => CareDays.of(DateTime.makeUnsafe(date), 'UTC')
    const addCare = async (plantId: string, date: Date) => {
      const [log] = await db
        .insert(schema.careLogs)
        .values({
          plantId,
          type: 'watering',
          date,
          careDay: careDayOf(date),
          notes: 'Seeded',
        })
        .returning()
      if (!log) throw new Error('care log insert failed')
      return log.id
    }
    const careRows = (plantId: string) =>
      db
        .select({
          id: schema.careLogs.id,
          date: schema.careLogs.date,
          notes: schema.careLogs.notes,
        })
        .from(schema.careLogs)
        .where(eq(schema.careLogs.plantId, plantId))
        .orderBy(asc(schema.careLogs.date))
    const dueDayOf = async (plantId: string) => {
      const schedule = await scheduleOf(plantId)
      return schedule?.nextCareAt ? dayOf(schedule.nextCareAt) : null
    }
    const unchanged = {
      on: Option.none(),
      notes: Option.none(),
      photoUrl: Option.none(),
    }

    it('moves the due day, the last care and the reminder with the latest care', async () => {
      const plantId = await addPlant('Edited', daysAgo(-2))
      await addCare(plantId, daysAgo(9))
      const latest = await addCare(plantId, daysAgo(5))
      const movedTo = daysAgo(3)

      await run(
        Effect.flatMap(Care, (care) =>
          care.amend({
            ...unchanged,
            permit: carePermit(plantId, userId),
            careLogId: latest,
            on: Option.some(
              CareWhen.At({ instant: DateTime.makeUnsafe(movedTo) })
            ),
          })
        ).pipe(Effect.tap(() => drainOutbox))
      )

      const schedule = await scheduleOf(plantId)
      const dueDay = CareDays.addDays(dayOf(movedTo), 7)
      expect(schedule?.lastCareAt).toEqual(movedTo)
      expect(await dueDayOf(plantId)).toBe(dueDay)
      const [reminder] = await remindersOf(plantId)
      expect(reminder?.type).toBe('watering_reminder')
      expect(dayOf(reminder?.scheduledAt ?? new Date(0))).toBe(dueDay)
    })

    it('keeps the notes of a care whose day alone is edited', async () => {
      const plantId = await addPlant('Kept', daysAgo(-2))
      const only = await addCare(plantId, daysAgo(5))

      await run(
        Effect.flatMap(Care, (care) =>
          care.amend({
            ...unchanged,
            permit: carePermit(plantId, userId),
            careLogId: only,
            on: Option.some(
              CareWhen.At({ instant: DateTime.makeUnsafe(daysAgo(4)) })
            ),
          })
        )
      )

      expect(Array.map(await careRows(plantId), (row) => row.notes)).toEqual([
        'Seeded',
      ])
    })

    it('keeps the last care exact when a care moves within its day', async () => {
      const plantId = await addPlant('Same day', daysAgo(-2))
      const morning = new Date(`${dayOf(daysAgo(5))}T08:00:00.000Z`)
      const evening = new Date(`${dayOf(daysAgo(5))}T19:00:00.000Z`)
      const only = await addCare(plantId, morning)

      await run(
        Effect.flatMap(Care, (care) =>
          care.amend({
            ...unchanged,
            permit: carePermit(plantId, userId),
            careLogId: only,
            on: Option.some(
              CareWhen.At({ instant: DateTime.makeUnsafe(evening) })
            ),
          })
        )
      )

      const schedule = await scheduleOf(plantId)
      expect(schedule?.lastCareAt).toEqual(evening)
      expect(await dueDayOf(plantId)).toBe(dayOf(daysAgo(-2)))
    })

    it('edits one of two cares that already share a day', async () => {
      const plantId = await addPlant('Twice', daysAgo(-2))
      const noon = new Date(`${dayOf(daysAgo(5))}T12:00:00.000Z`)
      await addCare(plantId, new Date(noon.getTime() - 3_600_000))
      const second = await addCare(plantId, noon)

      await run(
        Effect.flatMap(Care, (care) =>
          care.amend({
            ...unchanged,
            permit: carePermit(plantId, userId),
            careLogId: second,
            notes: Option.some(Option.some('Second pass')),
          })
        )
      )

      expect(Array.map(await careRows(plantId), (row) => row.notes)).toEqual([
        'Seeded',
        'Second pass',
      ])
      expect(await dueDayOf(plantId)).toBe(dayOf(daysAgo(-2)))
    })

    it('counts the due day and the last care from the care before a removed one', async () => {
      const plantId = await addPlant('Removed', daysAgo(-2))
      const earlier = daysAgo(9)
      await addCare(plantId, earlier)
      const latest = await addCare(plantId, daysAgo(5))

      await run(
        Effect.flatMap(Care, (care) =>
          care.remove({
            permit: carePermit(plantId, userId),
            careLogId: latest,
          })
        )
      )

      const schedule = await scheduleOf(plantId)
      expect(Array.map(await careRows(plantId), (row) => row.date)).toEqual([
        earlier,
      ])
      expect(schedule?.lastCareAt).toEqual(earlier)
      expect(await dueDayOf(plantId)).toBe(CareDays.addDays(dayOf(earlier), 7))
    })

    it('refuses to edit a care through a permit for another plant', async () => {
      const plantId = await addPlant('Mine')
      const other = await addPlant('Theirs')
      const theirs = await addCare(other, daysAgo(5))

      const failure = await run(
        Effect.flatMap(Care, (care) =>
          care.amend({
            ...unchanged,
            permit: carePermit(plantId, userId),
            careLogId: theirs,
            notes: Option.some(Option.some('Hijacked')),
          })
        ).pipe(Effect.flip)
      )

      expect(failure._tag).toBe('CareLogNotFoundError')
      expect(Array.map(await careRows(other), (row) => row.notes)).toEqual([
        'Seeded',
      ])
    })

    it('records a care by the caller when a correction finds none', async () => {
      const plantId = await addPlant('Corrected')
      const on = daysAgo(2)

      await run(
        Effect.flatMap(Care, (care) =>
          care.correctLastCare({
            permit: carePermit(plantId, userId),
            corrections: [
              {
                careType: 'watering',
                on: CareWhen.At({ instant: DateTime.makeUnsafe(on) }),
              },
            ],
          })
        )
      )

      expect(await logsOf([plantId])).toEqual([{ plantId, by: userId }])
      expect(await dueDayOf(plantId)).toBe(CareDays.addDays(dayOf(on), 7))
    })
  })

  describe('what other contexts are told', () => {
    const yesterday = () => new Date(Date.now() - 86_400_000)
    const seedOverdue = async () => {
      const plantId = await addPlant('Needy', yesterday())
      await db.insert(schema.notifications).values({
        userId,
        plantId,
        type: 'overdue_reminder',
        title: 'Overdue',
        body: 'Water me',
        scheduledAt: new Date(Date.now() + 3_600_000),
        status: 'pending',
      })
      return plantId
    }

    it('commits the events with the care, and nothing when the care rolls back', async () => {
      const plantId = await seedOverdue()
      await db.execute(sql`
          CREATE OR REPLACE FUNCTION fail_schedule_write() RETURNS trigger AS $$
          BEGIN RAISE EXCEPTION 'schedule write failed'; END;
          $$ LANGUAGE plpgsql
        `)
      await db.execute(sql`
          CREATE TRIGGER fail_schedule_write BEFORE UPDATE ON plant_care_schedules
          FOR EACH ROW EXECUTE FUNCTION fail_schedule_write()
        `)

      const failed = await run(water(plantId).pipe(Effect.exit)).finally(() =>
        db.execute(
          sql`DROP TRIGGER fail_schedule_write ON plant_care_schedules`
        )
      )

      expect(failed._tag).toBe('Failure')
      expect(await logsOf([plantId])).toEqual([])
      expect(await pendingEvents()).toBe(0)

      await run(water(plantId))

      expect(await logsOf([plantId])).toHaveLength(1)
      expect(await pendingEvents()).toBe(2)
    })

    it('rebuilds the reminders after a crash between the commit and the delivery', async () => {
      const plantId = await seedOverdue()
      const publishedEvents: AppEvent[] = []

      const recorded = await run(water(plantId))

      expect(await remindersOf(plantId)).toEqual([
        expect.objectContaining({ type: 'overdue_reminder' }),
      ])
      expect(publishedEvents).toEqual([])

      const delivered = await run(drainOutbox, publishedEvents)

      const dueDay = pipe(recorded.dueDay, Option.getOrThrow)
      expect(delivered).toBe(2)
      expect(await pendingEvents()).toBe(0)
      const reminders = await remindersOf(plantId)
      expect(Array.map(reminders, (r) => r.type)).toEqual(['watering_reminder'])
      expect(
        CareDays.of(
          DateTime.makeUnsafe(reminders[0]?.scheduledAt ?? new Date(0)),
          'UTC'
        )
      ).toBe(dueDay)
      expect(Array.map(publishedEvents, (e) => e._tag)).toEqual([
        'CareLogCreated',
        'AttentionResponded',
      ])
    })

    it('keeps the pending overdue reminder while another care of the plant is still overdue', async () => {
      const plantId = await seedOverdue()
      const dueAt = yesterday()
      await db.insert(schema.plantCareSchedules).values({
        plantId,
        careType: 'misting',
        frequencyDays: 3,
        nextCareAt: dueAt,
        dueDay: careDayOf(dueAt),
      })

      await run(water(plantId).pipe(Effect.tap(() => drainOutbox)))

      expect(Array.map(await remindersOf(plantId), (r) => r.type)).toEqual([
        'watering_reminder',
        'overdue_reminder',
      ])

      await run(
        Effect.flatMap(Care, (care) =>
          care.recordOne({
            ...waterToday,
            careType: 'misting',
            permit: carePermit(plantId, userId),
          })
        ).pipe(Effect.tap(() => drainOutbox))
      )

      expect(Array.map(await remindersOf(plantId), (r) => r.type)).toEqual([
        'watering_reminder',
        'misting_reminder',
      ])
    })

    it('drops the pending overdue reminder after a care that has no schedule to move', async () => {
      const plantId = await seedOverdue()
      await db
        .delete(schema.plantCareSchedules)
        .where(eq(schema.plantCareSchedules.plantId, plantId))

      await run(water(plantId).pipe(Effect.tap(() => drainOutbox)))

      expect(await logsOf([plantId])).toHaveLength(1)
      expect(await remindersOf(plantId)).toEqual([])
    })

    it('tells achievements that a care answered a reminder sent today', async () => {
      const plantId = await addPlant('Reminded')
      await db.insert(schema.notifications).values({
        userId,
        plantId,
        type: 'watering_reminder',
        scheduledAt: new Date(),
        sentAt: new Date(),
        status: 'sent',
      })
      const publishedEvents: AppEvent[] = []

      await run(
        water(plantId).pipe(Effect.tap(() => drainOutbox)),
        publishedEvents
      )

      expect(publishedEvents).toContainEqual({
        _tag: 'ReminderResponded',
        userId,
        plantId,
      })
    })

    it('keeps the care and retries the reminders when their rebuild fails', async () => {
      const plantId = await seedOverdue()
      await db.execute(sql`
          CREATE OR REPLACE FUNCTION fail_watering_reminder() RETURNS trigger AS $$
          BEGIN RAISE EXCEPTION 'reminder rebuild failed'; END;
          $$ LANGUAGE plpgsql
        `)
      await db.execute(sql`
          CREATE TRIGGER fail_watering_reminder BEFORE INSERT ON notifications
          FOR EACH ROW WHEN (NEW.type = 'watering_reminder')
          EXECUTE FUNCTION fail_watering_reminder()
        `)

      await run(water(plantId).pipe(Effect.tap(() => drainOutbox))).finally(
        () =>
          db.execute(sql`DROP TRIGGER fail_watering_reminder ON notifications`)
      )

      expect(await logsOf([plantId])).toHaveLength(1)
      expect(await pendingEvents()).toBe(2)
      const [stuck] = await db
        .select({
          pendingConsumers: schema.outbox.pendingConsumers,
          lastError: schema.outbox.lastError,
        })
        .from(schema.outbox)
        .where(sql`${schema.outbox.processedAt} is null`)
      expect(stuck?.pendingConsumers).toEqual(['reminders'])
      expect(stuck?.lastError).toContain('reminder rebuild failed')

      await db.execute(
        sql`UPDATE outbox SET available_at = now() - interval '1 minute', claimed_until = NULL`
      )
      await run(drainOutbox)

      expect(await pendingEvents()).toBe(0)
      expect(Array.map(await remindersOf(plantId), (r) => r.type)).toEqual([
        'watering_reminder',
      ])
    })

    it('reads derived health as healthy once the overdue care is recorded', async () => {
      const plantId = await seedOverdue()
      const healthOf = Effect.flatMap(PlantRepository, (repo) =>
        Effect.map(repo.findById(plantId), (plant) => plant?.health)
      )

      const before = await run(healthOf)
      const after = await run(Effect.andThen(water(plantId), healthOf))

      expect([before, after]).toEqual(['NEEDS_ATTENTION', 'HEALTHY'])
    })
  })

  describe('schedules', () => {
    const DAY = 86_400_000
    const utcDay = (date: Date) => CareDays.of(DateTime.makeUnsafe(date), 'UTC')
    const editPermit = (plantId: string) =>
      mintPermit(plantId, 'edit', Actor.User({ userId }))
    const setWatering = (plantId: string, days: Option.Option<number>) =>
      Effect.flatMap(Care, (care) =>
        care.setSchedules({
          permit: editPermit(plantId),
          frequencies: [['watering', Option.map(days, frequencyOfDays)]],
        })
      )
    const careDaysOf = (plantId: string) =>
      db
        .select({ careDay: schema.careLogs.careDay })
        .from(schema.careLogs)
        .where(eq(schema.careLogs.plantId, plantId))

    it('stores the care day with a care and the due day with its schedule', async () => {
      const plantId = await addPlant('Dated')
      const today = utcDay(new Date())

      await run(water(plantId))

      expect(await careDaysOf(plantId)).toEqual([{ careDay: today }])
      const schedule = await scheduleOf(plantId)
      expect(schedule?.dueDay).toBe(CareDays.addDays(today, 7))
      expect(schedule?.nextCareAt).toEqual(
        new Date(`${CareDays.addDays(today, 7)}T00:00:00.000Z`)
      )
    })

    it('counts a new frequency from the latest care and rebuilds the reminder', async () => {
      const plantId = await addPlant('Thirsty')
      const cared = new Date(Date.now() - 2 * DAY)
      await db.insert(schema.careLogs).values({
        plantId,
        type: 'watering',
        date: cared,
        careDay: careDayOf(cared),
      })

      await run(
        Effect.andThen(setWatering(plantId, Option.some(5)), drainOutbox)
      )

      const due = CareDays.addDays(utcDay(cared), 5)
      const schedule = await scheduleOf(plantId)
      expect([schedule?.frequencyDays, schedule?.dueDay]).toEqual([5, due])
      const reminders = await remindersOf(plantId)
      expect(Array.map(reminders, (r) => r.type)).toEqual(['watering_reminder'])
      expect(Array.map(reminders, (r) => utcDay(r.scheduledAt))).toEqual([due])
    })

    it('stops a schedule and drops its pending reminder', async () => {
      const plantId = await addPlant('Paused', new Date(Date.now() + 3 * DAY))
      const caredAt = new Date(Date.now() - DAY)
      await db.insert(schema.careLogs).values({
        plantId,
        type: 'watering',
        date: caredAt,
        careDay: careDayOf(caredAt),
      })
      await run(
        Effect.andThen(setWatering(plantId, Option.some(4)), drainOutbox)
      )
      expect(await remindersOf(plantId)).toHaveLength(1)

      await run(
        Effect.andThen(setWatering(plantId, Option.none()), drainOutbox)
      )

      expect(await scheduleOf(plantId)).toBeUndefined()
      expect(await remindersOf(plantId)).toEqual([])
    })

    it('moves a due day by whole days and tells Reminders', async () => {
      const plantId = await addPlant(
        'Rained on',
        new Date(Date.now() + 2 * DAY)
      )
      const before = await scheduleOf(plantId)

      await run(
        Effect.flatMap(Care, (care) =>
          care.moveDueDays({
            reason: 'weather',
            moves: [
              { plantId, careType: 'watering', move: DueMove.By({ days: 3 }) },
            ],
          })
        ).pipe(Effect.andThen(drainOutbox))
      )

      const due = utcDay(new Date(Date.now() + 5 * DAY))
      expect((await scheduleOf(plantId))?.dueDay).toBe(due)
      expect((await scheduleOf(plantId))?.frequencyDays).toBe(
        before?.frequencyDays
      )
      expect(
        Array.map(await remindersOf(plantId), (r) => utcDay(r.scheduledAt))
      ).toEqual([due])
    })

    it('saves nothing of a plant edit whose schedule change is refused', async () => {
      const plantId = await addPlant('Buried', undefined, {
        diedAt: new Date(),
        deathCause: 'unknown',
      })
      const rename = Effect.gen(function* () {
        const repo = yield* PlantRepository
        const plant = yield* Effect.fromNullishOr(yield* repo.findById(plantId))
        return yield* updatePlant(plant, editPermit(plantId), {
          id: plantId,
          name: 'Renamed',
          wateringFrequencyDays: 3,
        })
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            RoomRepositoryLive,
            Layer.succeed(GCSService, {} as never),
            Layer.succeed(FileSystem, {} as never)
          )
        ),
        Effect.flip
      )

      const refusal = await run(rename)

      expect(refusal).toMatchObject({ _tag: 'PlantIsDeadError' })
      const [row] = await db
        .select({ name: schema.plants.name })
        .from(schema.plants)
        .where(eq(schema.plants.id, plantId))
      expect(row?.name).toBe('Buried')
      expect((await scheduleOf(plantId))?.frequencyDays).toBe(7)
    })
  })

  describe('the day a row was stored with', () => {
    const DAY = 86_400_000
    const today = () => careDayOf(new Date())
    const waterNow = (plantId: string) =>
      run(
        Effect.flatMap(Care, (care) =>
          care.record({ ...waterToday, permits: [carePermit(plantId, userId)] })
        )
      ).then(summary)
    const addCare = (plantId: string, date: Date, careDay: string) =>
      db
        .insert(schema.careLogs)
        .values({ plantId, type: 'watering', date, careDay })
    const moveByThreeDays = (plantId: string) =>
      run(
        Effect.flatMap(Care, (care) =>
          care.moveDueDays({
            reason: 'weather',
            moves: [
              { plantId, careType: 'watering', move: DueMove.By({ days: 3 }) },
            ],
          })
        )
      )
    const storeDueDay = (plantId: string, dueDay: string) =>
      db
        .update(schema.plantCareSchedules)
        .set({ dueDay })
        .where(eq(schema.plantCareSchedules.plantId, plantId))

    it('counts a care on its stored care day, also when its instant falls on an earlier day (the stored day stays put, as declared for the due day)', async () => {
      const plantId = await addPlant('Stored care')
      await addCare(plantId, new Date(Date.now() - 2 * DAY), today())

      expect(await waterNow(plantId)).toEqual(['AlreadyCared'])
    })

    it('moves a schedule from its stored due day, not from the day of its instant', async () => {
      const plantId = await addPlant(
        'Stored due',
        new Date(Date.now() - 2 * DAY)
      )
      const stored = CareDays.addDays(today(), 4)
      await storeDueDay(plantId, stored)

      await moveByThreeDays(plantId)

      expect((await scheduleOf(plantId))?.dueDay).toBe(
        CareDays.addDays(stored, 3)
      )
    })
  })
})
