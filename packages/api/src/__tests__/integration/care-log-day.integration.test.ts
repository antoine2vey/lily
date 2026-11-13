import { CareOnPostgresLive } from '@lily/api/__tests__/integration/care-layers'
import { carePermit } from '@lily/api/__tests__/mocks/care'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import { CareReadsLive } from '@lily/api/contexts/care'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import {
  CareLogRepository,
  CareLogRepositoryLive,
} from '@lily/api/repositories/care-log.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import {
  PlantRepository,
  PlantRepositoryLive,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { createCareLog } from '@lily/api/services/care-logs/endpoints/create-care-log'
import { getRecentActivities } from '@lily/api/services/care-logs/endpoints/get-recent-activities'
import { updateCareLog } from '@lily/api/services/care-logs/endpoints/update-care-log'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import type { CareType } from '@lily/shared'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, Effect, Layer, Option, pipe, Record } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const RepositoriesLive = Layer.mergeAll(
  CanopyRepositoryLive,
  CareLogRepositoryLive,
  CareReadsLive,
  CareScheduleRepositoryLive,
  NotificationRepositoryLive,
  PlantRepositoryLive,
  UserRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const CareLogsLive = CareOnPostgresLive.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      RepositoriesLive,
      createMockDelegationRepository({}),
      createMockEventBus({ publishedEvents: [] }),
      createMockWeatherProvider(),
      createMockWeatherCache(),
      createMockWeatherRepository()
    )
  )
)

const ratings = {
  humidityRating: 3,
  lightingRating: 3,
  petToxicityRating: 1,
  wateringRating: 3,
}

const NOT_DUE_YET = new Date('2099-01-01T00:00:00.000Z')
const LATE_EVENING_IN_NEW_YORK = new Date('2024-03-10T02:30:00.000Z')
const AFTER_MIDNIGHT_IN_AUCKLAND = new Date('2024-03-10T12:30:00.000Z')

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'The care day of a care log - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>

    const run = <A, E>(
      effect: Effect.Effect<A, E, Layer.Success<typeof CareLogsLive>>
    ) => Effect.runPromise(effect.pipe(Effect.provide(CareLogsLive)))

    const addUser = async (timezone: string) => {
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `care-log-day-${crypto.randomUUID()}@example.com`,
          emailVerified: true,
          timezone,
        })
        .returning()
      if (!user) throw new Error('user insert returned nothing')
      return user.id
    }

    const addPlant = async (
      owner: Pick<
        typeof schema.plants.$inferInsert,
        'userId' | 'canopyId' | 'createdByUserId'
      >
    ) => {
      const [plant] = await db
        .insert(schema.plants)
        .values({ ...ratings, name: 'Monstera', ...owner })
        .returning()
      if (!plant) throw new Error('plant insert returned nothing')
      return plant.id
    }

    const addLog = async (
      plantId: string,
      date: Date,
      careDay: string | null,
      type: CareType = 'watering'
    ) => {
      const [log] = await db
        .insert(schema.careLogs)
        .values({ plantId, type, date, careDay })
        .returning()
      if (!log) throw new Error('care log insert returned nothing')
      return log.id
    }

    const addSchedule = (
      plantId: string,
      careType: CareType,
      lastCareAt: Date | null
    ) =>
      db.insert(schema.plantCareSchedules).values({
        plantId,
        careType,
        frequencyDays: 7,
        lastCareAt,
        nextCareAt: NOT_DUE_YET,
        dueDay: '2099-01-01',
      })

    const recentDays = (userId: string) =>
      run(
        getRecentActivities({}).pipe(
          Effect.provide(createMockCurrentUser({ id: userId })),
          Effect.map(({ items }) => Array.map(items, (item) => item.careDay))
        )
      )

    const daysByCareType = (plant: Option.Option<PlantWithRoom>) =>
      pipe(
        Option.toArray(plant),
        Array.flatMap((found) => found.schedules),
        Array.map(
          (schedule) => [schedule.careType, schedule.lastCareDay] as const
        ),
        Record.fromEntries
      )

    const lastCareDays = (userId: string, plantId: string) =>
      run(
        Effect.gen(function* () {
          const plants = yield* PlantRepository
          const one = yield* plants.findById(plantId)
          const list = yield* plants.findAll({ userId })
          return {
            one: daysByCareType(Option.fromNullishOr(one)),
            list: daysByCareType(
              Array.findFirst(list.items, (plant) => plant.id === plantId)
            ),
          }
        })
      )

    const answered = (plantId: string, logId: string) =>
      run(
        Effect.gen(function* () {
          const careLogs = yield* CareLogRepository
          const one = yield* careLogs.findById(logId, plantId)
          const list = yield* careLogs.findByPlantId({ plantId })
          return {
            one: one?.careDay,
            list: Array.map(list.items, (item) => item.careDay),
          }
        })
      )

    const storedDayOf = async (logId: string) => {
      const [row] = await db
        .select({ careDay: schema.careLogs.careDay })
        .from(schema.careLogs)
        .where(eq(schema.careLogs.id, logId))
      return row?.careDay
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    beforeEach(async () => {
      await db.execute(sql`TRUNCATE TABLE outbox RESTART IDENTITY`)
      await db.execute(sql`TRUNCATE TABLE plants RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE canopies RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
    })

    afterAll(async () => {
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE canopies RESTART IDENTITY CASCADE`)
      await pool.end()
    })

    it('answers the stored day, not the day of the instant in UTC or in the timezone the owner has now', async () => {
      const userId = await addUser('Asia/Tokyo')
      const plantId = await addPlant({ userId })
      const logId = await addLog(
        plantId,
        LATE_EVENING_IN_NEW_YORK,
        '2024-03-09'
      )

      expect(await answered(plantId, logId)).toEqual({
        one: '2024-03-09',
        list: ['2024-03-09'],
      })
    })

    it('gives a row without a stored day the day of its instant in the timezone of the owner', async () => {
      const userId = await addUser('America/New_York')
      const plantId = await addPlant({ userId })
      const logId = await addLog(plantId, LATE_EVENING_IN_NEW_YORK, null)

      expect(await answered(plantId, logId)).toEqual({
        one: '2024-03-09',
        list: ['2024-03-09'],
      })
    })

    it('gives a row without a stored day on a Canopy plant the day in the timezone of the Canopy', async () => {
      const createdByUserId = await addUser('America/New_York')
      const [canopy] = await db
        .insert(schema.canopies)
        .values({ name: 'Home', timezone: 'Pacific/Auckland' })
        .returning()
      if (!canopy) throw new Error('canopy insert returned nothing')
      const plantId = await addPlant({ canopyId: canopy.id, createdByUserId })
      const logId = await addLog(plantId, AFTER_MIDNIGHT_IN_AUCKLAND, null)

      expect(await answered(plantId, logId)).toEqual({
        one: '2024-03-11',
        list: ['2024-03-11'],
      })
    })

    it('gives recent activity and the last care of a schedule the local day of a care recorded when the UTC date is the day before', async () => {
      const userId = await addUser('Pacific/Auckland')
      const plantId = await addPlant({ userId })
      await addSchedule(plantId, 'watering', null)

      await run(
        createCareLog(carePermit(plantId, userId), {
          type: 'watering',
          date: AFTER_MIDNIGHT_IN_AUCKLAND,
        })
      )

      expect(await recentDays(userId)).toEqual(['2024-03-11'])
      expect(await lastCareDays(userId, plantId)).toEqual({
        one: { watering: '2024-03-11' },
        list: { watering: '2024-03-11' },
      })
    })

    it('gives recent activity and the last care of a schedule the stored day, not the day of the instant in the timezone the owner has now', async () => {
      const userId = await addUser('Asia/Tokyo')
      const plantId = await addPlant({ userId })
      await addLog(plantId, LATE_EVENING_IN_NEW_YORK, '2024-03-09')
      await addSchedule(plantId, 'watering', LATE_EVENING_IN_NEW_YORK)

      expect(await recentDays(userId)).toEqual(['2024-03-09'])
      expect(await lastCareDays(userId, plantId)).toEqual({
        one: { watering: '2024-03-09' },
        list: { watering: '2024-03-09' },
      })
    })

    it('gives a care without a stored day, and a last care with no care log, the day of the instant in the timezone of the owner', async () => {
      const userId = await addUser('America/New_York')
      const plantId = await addPlant({ userId })
      await addLog(plantId, LATE_EVENING_IN_NEW_YORK, null)
      await addSchedule(plantId, 'watering', LATE_EVENING_IN_NEW_YORK)
      await addSchedule(plantId, 'fertilization', LATE_EVENING_IN_NEW_YORK)
      await addSchedule(plantId, 'misting', null)
      const days = {
        watering: '2024-03-09',
        fertilization: '2024-03-09',
        misting: null,
      }

      expect(await recentDays(userId)).toEqual(['2024-03-09'])
      expect(await lastCareDays(userId, plantId)).toEqual({
        one: days,
        list: days,
      })
    })

    it('reads the last care day of a schedule from the care log of its own plant and care type', async () => {
      const userId = await addUser('UTC')
      const plantId = await addPlant({ userId })
      const otherPlantId = await addPlant({ userId })
      await addLog(plantId, LATE_EVENING_IN_NEW_YORK, '2024-03-09')
      await addLog(plantId, LATE_EVENING_IN_NEW_YORK, '2024-03-08', 'misting')
      await addLog(otherPlantId, LATE_EVENING_IN_NEW_YORK, '2024-03-11')
      await addSchedule(plantId, 'watering', LATE_EVENING_IN_NEW_YORK)
      await addSchedule(plantId, 'misting', LATE_EVENING_IN_NEW_YORK)
      await addSchedule(otherPlantId, 'watering', LATE_EVENING_IN_NEW_YORK)

      expect(await lastCareDays(userId, plantId)).toEqual({
        one: { watering: '2024-03-09', misting: '2024-03-08' },
        list: { watering: '2024-03-09', misting: '2024-03-08' },
      })
      expect(await lastCareDays(userId, otherPlantId)).toEqual({
        one: { watering: '2024-03-11' },
        list: { watering: '2024-03-11' },
      })
    })

    it('answers a new care and an edited care with the day the command stored', async () => {
      const userId = await addUser('America/New_York')
      const plantId = await addPlant({ userId })
      const permit = carePermit(plantId, userId)

      const created = await run(
        createCareLog(permit, {
          type: 'watering',
          date: LATE_EVENING_IN_NEW_YORK,
        })
      )

      expect(created.careDay).toBe('2024-03-09')
      expect(await storedDayOf(created.id)).toBe('2024-03-09')

      const edited = await run(
        updateCareLog(permit, created.id, {
          date: new Date('2024-03-08T03:00:00.000Z'),
        })
      )

      expect(edited.careDay).toBe('2024-03-07')
      expect(await storedDayOf(created.id)).toBe('2024-03-07')
    })
  }
)
