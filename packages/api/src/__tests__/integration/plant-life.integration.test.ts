import { delivered } from '@lily/api/__tests__/integration/canopy-layers'
import {
  buryAsCurrentUser,
  removeAsCurrentUser,
  reviveAsCurrentUser,
} from '@lily/api/__tests__/integration/care-layers'
import { ownerHeld, permitTo } from '@lily/api/__tests__/mocks/care'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockRateLimiterService } from '@lily/api/__tests__/mocks/rate-limiter.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { assumingTransaction } from '@lily/api/__tests__/mocks/transaction'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import type { Absence } from '@lily/api/contexts/absence'
import type { Canopy } from '@lily/api/contexts/canopy'
import {
  type Care,
  CareReadsLive,
  frequencyOfDays,
  OwnerRoom,
  type PlantDraft,
  PlantLife,
} from '@lily/api/contexts/care'
import { CareWrite } from '@lily/api/contexts/care/domain/decide'
import { CareStore, CareStoreLive } from '@lily/api/contexts/care/store'
import type { Outbox } from '@lily/api/kernel/outbox'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { DeviceTokenRepositoryLive } from '@lily/api/repositories/device-token.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { RefreshTokenRepositoryLive } from '@lily/api/repositories/refresh-token.repository'
import { RoomRepositoryLive } from '@lily/api/repositories/room.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { createPlant } from '@lily/api/services/plants/endpoints/create-plant'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { type CareDay, CareDays, type PlantOwner } from '@lily/shared'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { asc, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import {
  Array,
  Cause,
  DateTime,
  Effect,
  Exit,
  Layer,
  Option,
  References,
} from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const MORE_DAYS_THAN_THE_COLUMN_HOLDS = 3_000_000_000

const ReposLive = Layer.mergeAll(
  CareReadsLive,
  CanopyRepositoryLive,
  CareLogRepositoryLive,
  CareScheduleRepositoryLive,
  DelegationRepositoryLive,
  DeviceTokenRepositoryLive,
  NotificationRepositoryLive,
  PlantRepositoryLive,
  RefreshTokenRepositoryLive,
  RoomRepositoryLive,
  UserRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const appAs = (userId: string) =>
  Layer.mergeAll(
    createMockCurrentUser({ id: userId }),
    createMockEventBus(),
    createMockLimitChecker(),
    createMockMessageQueue(),
    createMockRateLimiterService(),
    createMockWeatherProvider(),
    createMockWeatherCache(),
    createMockWeatherRepository()
  ).pipe(Layer.provideMerge(ReposLive))

type App =
  | Layer.Success<ReturnType<typeof appAs>>
  | Outbox
  | Care
  | PlantLife
  | Canopy
  | Absence

const aTimezoneOnAnotherDay = () =>
  new Date().getUTCHours() >= 12 ? 'Pacific/Kiritimati' : 'Pacific/Pago_Pago'

const request = {
  name: 'Fern',
  wateringFrequencyDays: 7,
  luxNeeded: 2000,
  humidityRating: 3,
  petToxicityRating: 1,
}

const draft: PlantDraft = {
  name: 'Fern',
  description: Option.none(),
  category: Option.none(),
  imageUrl: Option.none(),
  humidityRating: 3,
  lightingRating: 3,
  petToxicityRating: 1,
  wateringRating: 3,
  potWidthCm: Option.none(),
  potHeightCm: Option.none(),
  roomId: Option.none(),
}

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Plant life - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let alex: string
    let canopyId: string

    const as = <A, E>(userId: string, effect: Effect.Effect<A, E, App>) =>
      Effect.runPromiseExit(
        effect.pipe(
          delivered,
          Effect.provide(appAs(userId)),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

    const done = async <A, E>(
      userId: string,
      effect: Effect.Effect<A, E, App>
    ) => {
      const exit = await as(userId, effect)
      if (Exit.isFailure(exit)) throw new Error(String(exit.cause))
      return exit.value
    }

    const published = async () => {
      const rows = await db
        .select({ topic: schema.outbox.topic, event: schema.outbox.event })
        .from(schema.outbox)
        .orderBy(asc(schema.outbox.id))
      return rows.map((row) => {
        const event = row.event as { _tag: string; life?: string }
        return `${row.topic}:${event._tag}${event.life ? `:${event.life}` : ''}`
      })
    }

    const schedulesOf = (plantId: string) =>
      db
        .select({
          careType: schema.plantCareSchedules.careType,
          frequencyDays: schema.plantCareSchedules.frequencyDays,
          dueDay: schema.plantCareSchedules.dueDay,
          nextCareAt: schema.plantCareSchedules.nextCareAt,
        })
        .from(schema.plantCareSchedules)
        .where(eq(schema.plantCareSchedules.plantId, plantId))
        .orderBy(asc(schema.plantCareSchedules.careType))

    const dueOn = (
      careType: 'watering' | 'misting',
      frequencyDays: number,
      dueDay: CareDay,
      timezone: string
    ) => ({
      careType,
      frequencyDays,
      dueDay,
      nextCareAt: DateTime.toDateUtc(CareDays.startOf(dueDay, timezone)),
    })

    const plantOf = async (
      owner: { userId: string } | { canopyId: string },
      life: 'living' | 'dead' = 'living'
    ) => {
      const [row] = await db
        .insert(schema.plants)
        .values({
          ...owner,
          createdByUserId: alex,
          name: 'Fern',
          health: 'HEALTHY',
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
          ...(life === 'dead'
            ? { diedAt: new Date('2026-01-01'), deathCause: 'unknown' as const }
            : {}),
        })
        .returning()
      if (!row) throw new Error('plant insert returned nothing')
      await db.insert(schema.plantCareSchedules).values([
        {
          plantId: row.id,
          careType: 'watering',
          frequencyDays: 7,
          nextCareAt: new Date('2026-01-03T00:00:00Z'),
          dueDay: '2026-01-03',
        },
        {
          plantId: row.id,
          careType: 'misting',
          frequencyDays: 3,
          nextCareAt: new Date('2099-01-01T00:00:00Z'),
          dueDay: '2099-01-01',
        },
      ])
      return row.id
    }

    const lifeOf = async (plantId: string) => {
      const [row] = await db
        .select({
          canopyId: schema.plants.canopyId,
          diedAt: schema.plants.diedAt,
        })
        .from(schema.plants)
        .where(eq(schema.plants.id, plantId))
      return row
    }

    const todayIn = (timezone: string) =>
      CareDays.today(timezone, DateTime.nowUnsafe())

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    beforeEach(async () => {
      for (const table of [
        'outbox',
        'notifications',
        'care_delegations',
        'plant_care_schedules',
        'plants',
        'canopy_members',
        'canopies',
        'users',
      ]) {
        await db.execute(
          sql.raw(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`)
        )
      }
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `alex-${Date.now()}@example.com`,
          name: 'Alex',
          emailVerified: true,
          role: 'user',
          status: 'active',
          timezone: 'UTC',
        })
        .returning()
      if (!user) throw new Error('user insert returned nothing')
      alex = user.id
      const [canopy] = await db
        .insert(schema.canopies)
        .values({ name: 'Flat', timezone: 'UTC' })
        .returning()
      if (!canopy) throw new Error('canopy insert returned nothing')
      canopyId = canopy.id
      await db
        .insert(schema.canopyMembers)
        .values({ canopyId, userId: alex, role: 'owner' })
    })

    afterAll(async () => {
      await pool.end()
    })

    describe('creating a plant', () => {
      it('commits the plant, its schedules and one planted fact, and asks Reminders for nothing', async () => {
        const created = await done(
          alex,
          createPlant({ ...request, mistingFrequencyDays: 3 })
        )

        const rows = await db.select().from(schema.plants)
        expect(
          rows.map((row) => [row.id, row.userId, row.createdByUserId])
        ).toEqual([[created.id, alex, alex]])
        expect(await schedulesOf(created.id)).toEqual([
          dueOn('watering', 7, todayIn('UTC'), 'UTC'),
          dueOn('misting', 3, todayIn('UTC'), 'UTC'),
        ])
        expect((await published()).sort()).toEqual([
          'care:PlantLifeChanged:Planted',
          'care:ScheduleChanged',
          'care:ScheduleChanged',
        ])
      })

      it('leaves no plant and no fact when the database refuses a schedule', async () => {
        const exit = await as(
          alex,
          createPlant({
            ...request,
            wateringFrequencyDays: MORE_DAYS_THAN_THE_COLUMN_HOLDS,
          })
        )

        expect(Exit.isFailure(exit)).toBe(true)
        expect(await db.select().from(schema.plants)).toEqual([])
        expect(await published()).toEqual([])
      })

      it('writes all or nothing without a transaction of the caller', async () => {
        const exit = await as(
          alex,
          Effect.flatMap(PlantLife, (life) =>
            life.plant({
              held: ownerHeld({ _tag: 'User', userId: alex }),
              by: alex,
              draft,
              frequencies: [
                [
                  'watering',
                  Option.some(frequencyOfDays(MORE_DAYS_THAN_THE_COLUMN_HOLDS)),
                ],
              ],
            })
          )
        )

        expect(Exit.isFailure(exit)).toBe(true)
        expect(await db.select().from(schema.plants)).toEqual([])
        expect(await published()).toEqual([])
      })

      it('puts a Canopy plant in the Canopy and records who created it', async () => {
        const created = await done(
          alex,
          createPlant({ ...request, owner: 'canopy' })
        )

        const rows = await db.select().from(schema.plants)
        expect(
          rows.map((row) => [
            row.id,
            row.userId,
            row.canopyId,
            row.createdByUserId,
          ])
        ).toEqual([[created.id, null, canopyId, alex]])
      })

      it("starts a personal plant's schedules today in its owner's timezone", async () => {
        const timezone = aTimezoneOnAnotherDay()
        await db
          .update(schema.users)
          .set({ timezone })
          .where(eq(schema.users.id, alex))

        const created = await done(alex, createPlant(request))

        expect(todayIn(timezone)).not.toBe(todayIn('UTC'))
        expect(created.careTimezone).toBe(timezone)
        expect(await schedulesOf(created.id)).toEqual([
          dueOn('watering', 7, todayIn(timezone), timezone),
        ])
      })

      it("starts a Canopy plant's schedules today in the Canopy's timezone", async () => {
        const timezone = aTimezoneOnAnotherDay()
        await db
          .update(schema.canopies)
          .set({ timezone })
          .where(eq(schema.canopies.id, canopyId))

        const created = await done(
          alex,
          createPlant({ ...request, owner: 'canopy' })
        )

        expect(todayIn(timezone)).not.toBe(todayIn('UTC'))
        expect(created.careTimezone).toBe(timezone)
        expect(await schedulesOf(created.id)).toEqual([
          dueOn('watering', 7, todayIn(timezone), timezone),
        ])
      })
    })

    describe('burying a plant', () => {
      it('keeps every schedule and says so once, on the Care topic alone', async () => {
        const plantId = await plantOf({ userId: alex })
        const before = await schedulesOf(plantId)

        const buried = await done(
          alex,
          buryAsCurrentUser(plantId, { cause: 'pests', note: 'aphids' })
        )

        expect(buried).toMatchObject({
          deathCause: 'pests',
          deathNote: 'aphids',
        })
        expect(buried.diedAt).not.toBeNull()
        expect(await schedulesOf(plantId)).toEqual(before)
        expect(await published()).toEqual(['care:PlantLifeChanged:Buried'])
      })
    })

    describe('reviving a plant', () => {
      const restarted = (timezone: string) => [
        dueOn('watering', 7, CareDays.addDays(todayIn(timezone), 7), timezone),
        dueOn('misting', 3, CareDays.addDays(todayIn(timezone), 3), timezone),
      ]

      it("restarts every due day at today plus its frequency in its owner's timezone, and says so once", async () => {
        const timezone = aTimezoneOnAnotherDay()
        await db
          .update(schema.users)
          .set({ timezone })
          .where(eq(schema.users.id, alex))
        const plantId = await plantOf({ userId: alex }, 'dead')

        const revived = await done(alex, reviveAsCurrentUser(plantId))

        expect(todayIn(timezone)).not.toBe(todayIn('UTC'))
        expect(revived.diedAt).toBeNull()
        expect(await schedulesOf(plantId)).toEqual(restarted(timezone))
        expect((await published()).sort()).toEqual([
          'care:PlantLifeChanged:Revived',
          'care:ScheduleChanged',
          'care:ScheduleChanged',
        ])
      })

      it("restarts a Canopy plant's due days in the Canopy's timezone, not the member's", async () => {
        const timezone = aTimezoneOnAnotherDay()
        await db
          .update(schema.canopies)
          .set({ timezone })
          .where(eq(schema.canopies.id, canopyId))
        const plantId = await plantOf({ canopyId }, 'dead')

        await done(alex, reviveAsCurrentUser(plantId))

        expect(todayIn(timezone)).not.toBe(todayIn('UTC'))
        expect(await schedulesOf(plantId)).toEqual(restarted(timezone))
      })
    })

    describe('removing a plant', () => {
      it('deletes the plant with its schedules and says so once, on the Care topic alone', async () => {
        const plantId = await plantOf({ userId: alex })

        await done(alex, removeAsCurrentUser(plantId))

        expect(await lifeOf(plantId)).toBeUndefined()
        expect(await schedulesOf(plantId)).toEqual([])
        expect(await published()).toEqual(['care:PlantLifeChanged:Removed'])
      })
    })

    it('a plant life write that finds the row in another state than the one decided on is a defect and writes nothing', async () => {
      const living = await plantOf({ userId: alex })
      const dead = await plantOf({ userId: alex }, 'dead')
      const applied = (write: CareWrite) =>
        Effect.flatMap(CareStore, (store) => store.apply([write])).pipe(
          assumingTransaction,
          Effect.exit,
          Effect.provide(
            CareStoreLive.pipe(
              Layer.provide(DrizzleLive),
              Layer.provide(PgLive)
            )
          ),
          Effect.runPromise
        )

      const exits = [
        await applied(
          CareWrite.BuryPlant({
            plantId: dead,
            at: DateTime.nowUnsafe(),
            cause: 'pests',
            note: Option.none(),
          })
        ),
        await applied(CareWrite.RevivePlant({ plantId: living })),
        await applied(CareWrite.DeletePlant({ plantId: crypto.randomUUID() })),
      ]

      expect(
        Array.map(exits, (exit) =>
          Exit.isFailure(exit) && Cause.hasDies(exit.cause)
            ? String(Cause.squash(exit.cause))
            : 'written'
        )
      ).toEqual(Array.replicate('PlantRowNotWrittenDefect', 3))
      const [stillDead] = await db
        .select({ cause: schema.plants.deathCause })
        .from(schema.plants)
        .where(eq(schema.plants.id, dead))
      expect(stillDead).toEqual({ cause: 'unknown' })
      expect(await lifeOf(living)).toEqual({ canopyId: null, diedAt: null })
    })

    it('refuses to bury, revive or remove a plant under an owner it does not have, and leaves the row untouched', async () => {
      const plantId = await plantOf({ canopyId })
      const notItsOwner: PlantOwner = { _tag: 'User', userId: alex }

      const refused = await done(
        alex,
        Effect.flatMap(PlantLife, (life) =>
          Effect.all([
            Effect.flip(
              life.bury({
                permit: permitTo('markDead', plantId, alex),
                seenOwner: notItsOwner,
                cause: 'unknown',
                note: Option.none(),
              })
            ),
            Effect.flip(
              life.revive({
                permit: permitTo('revive', plantId, alex),
                held: ownerHeld(notItsOwner),
                room: OwnerRoom.Room(),
              })
            ),
            Effect.flip(
              life.remove({
                permit: permitTo('delete', plantId, alex),
                seenOwner: notItsOwner,
              })
            ),
          ])
        )
      )

      expect(refused).toEqual(
        Array.replicate(new PlantNotFoundError({ plantId }), 3)
      )
      expect(await lifeOf(plantId)).toEqual({ canopyId, diedAt: null })
      expect(await published()).toEqual([])
    })
  }
)
