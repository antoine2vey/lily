import { delivered, leave } from '@lily/api/__tests__/integration/canopy-layers'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockRateLimiterService } from '@lily/api/__tests__/mocks/rate-limiter.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import {
  Canopy,
  type CanopyEvent,
  CanopyTopic,
  hashInviteToken,
  JoinVia,
} from '@lily/api/contexts/canopy'
import { type Care, CareReadsLive } from '@lily/api/contexts/care'
import { Dirty, Reminders } from '@lily/api/contexts/reminders'
import { Outbox } from '@lily/api/kernel/outbox'
import { Actor, mintPermit } from '@lily/api/kernel/permit'
import { transact } from '@lily/api/kernel/transact'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { DeviceTokenRepositoryLive } from '@lily/api/repositories/device-token.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import {
  PlantRepository,
  PlantRepositoryLive,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import { RefreshTokenRepositoryLive } from '@lily/api/repositories/refresh-token.repository'
import { RoomRepositoryLive } from '@lily/api/repositories/room.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { deleteMyCanopy } from '@lily/api/services/canopy/endpoints/delete-my-canopy'
import { updateMyCanopy } from '@lily/api/services/canopy/endpoints/update-my-canopy'
import { deletePlant } from '@lily/api/services/plants/endpoints/delete-plant'
import { markPlantDead } from '@lily/api/services/plants/endpoints/mark-plant-dead'
import {
  mutePlant,
  unmutePlant,
} from '@lily/api/services/plants/endpoints/mute-plant'
import { revivePlant } from '@lily/api/services/plants/endpoints/revive-plant'
import { sharePlantWithCanopy } from '@lily/api/services/plants/endpoints/share-plant-with-canopy'
import { unsharePlant } from '@lily/api/services/plants/endpoints/unshare-plant'
import { deleteAccount } from '@lily/api/services/user/endpoints/delete-account'
import { updateUserSettings } from '@lily/api/services/user/endpoints/update-user-settings'
import { purgeAccount } from '@lily/api/services/user/helpers/purge-account'
import { activateVacation } from '@lily/api/services/vacation/helpers/activate-vacation'
import { endVacation } from '@lily/api/services/vacation/helpers/end-vacation'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { CanopyId, CareDays, type PlantOwner } from '@lily/shared'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, DateTime, Effect, Layer, References } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const DAY_MS = 86_400_000

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

type App = Layer.Success<ReturnType<typeof appAs>> | Outbox | Care | Canopy

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'What makes reminders stale reaches Reminders - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let alex: string
    let lily: string
    let canopyId: string
    let personal: string
    let shared: string
    const labels = new Map<string, string>()
    const dueAt = new Date(Date.now() + 3 * DAY_MS)

    const user = async (name: string) => {
      const [row] = await db
        .insert(schema.users)
        .values({
          email: `${name.toLowerCase()}-${Date.now()}@example.com`,
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
      labels.set(row.id, name.toLowerCase())
      return row.id
    }

    const plant = async (
      label: string,
      owner: { userId: string } | { canopyId: string },
      createdByUserId = alex
    ) => {
      const [row] = await db
        .insert(schema.plants)
        .values({
          ...owner,
          createdByUserId,
          name: label,
          health: 'HEALTHY',
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
        })
        .returning()
      if (!row) throw new Error(`Failed to create plant ${label}`)
      await db.insert(schema.plantCareSchedules).values({
        plantId: row.id,
        careType: 'watering',
        frequencyDays: 7,
        nextCareAt: dueAt,
      })
      labels.set(row.id, label)
      return row.id
    }

    const waitingRows = () =>
      db
        .select({
          userId: schema.notifications.userId,
          plantId: schema.notifications.plantId,
          type: schema.notifications.type,
          occasionDay: schema.notifications.occasionDay,
        })
        .from(schema.notifications)
        .where(
          sql`${schema.notifications.status} IN ('pending', 'queued') AND ${schema.notifications.plantId} IS NOT NULL`
        )

    const waiting = async () =>
      Array.map(
        await waitingRows(),
        (row) =>
          `${labels.get(row.userId)}:${labels.get(row.plantId ?? '')}:${row.type}`
      ).sort()

    const alsoWaitingForAPhoto = (
      ...holders: ReadonlyArray<readonly [userId: string, plantId: string]>
    ) =>
      db.insert(schema.notifications).values(
        Array.map(holders, ([userId, plantId]) => ({
          type: 'photo_reminder' as const,
          scheduledAt: dueAt,
          userId,
          plantId,
          status: 'pending' as const,
        }))
      )

    const requests = async () => {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.outbox)
      return row?.count
    }

    const as = <A, E>(userId: string, effect: Effect.Effect<A, E, App>) =>
      Effect.runPromise(
        effect.pipe(
          delivered,
          Effect.provide(appAs(userId)),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

    const on = <A, E>(
      plantId: string,
      act: (plant: PlantWithRoom) => Effect.Effect<A, E, App>
    ) =>
      Effect.flatMap(PlantRepository, (repo) => repo.findById(plantId)).pipe(
        Effect.flatMap((found) =>
          found === null ? Effect.die(`no plant ${plantId}`) : act(found)
        )
      )

    const plan = (...plantIds: ReadonlyArray<string>) =>
      as(alex, transact(Reminders.request(Dirty.Plants({ plantIds }))))

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    beforeEach(async () => {
      labels.clear()
      for (const table of [
        'outbox',
        'notifications',
        'care_delegations',
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
      lily = await user('Lily')
      const [canopy] = await db
        .insert(schema.canopies)
        .values({ name: 'Flat', timezone: 'UTC' })
        .returning()
      if (!canopy) throw new Error('Failed to create canopy')
      canopyId = canopy.id
      await db.insert(schema.canopyMembers).values([
        { canopyId, userId: alex, role: 'owner' },
        { canopyId, userId: lily, role: 'member' },
      ])
      personal = await plant('personal', { userId: alex })
      shared = await plant('shared', { canopyId })
    })

    afterAll(async () => {
      await pool.end()
    })

    it('a buried plant loses its waiting reminders', async () => {
      await plan(personal, shared)

      await as(
        alex,
        on(personal, (found) => markPlantDead(found, { cause: 'unknown' }))
      )

      expect(await waiting()).toEqual([
        'alex:shared:watering_reminder',
        'lily:shared:watering_reminder',
      ])
    })

    it('a revived plant gets its reminders back', async () => {
      await db.execute(
        sql`UPDATE plants SET died_at = now() WHERE id = ${personal}`
      )
      await plan(personal)
      const whileDead = await waiting()

      await as(alex, on(personal, revivePlant))

      expect(whileDead).toEqual([])
      expect(await waiting()).toEqual(['alex:personal:watering_reminder'])
    })

    it('a deleted plant takes its reminders with it and asks for nothing', async () => {
      await plan(personal, shared)
      const before = await requests()

      await as(alex, on(personal, deletePlant))

      expect(await waiting()).toEqual([
        'alex:shared:watering_reminder',
        'lily:shared:watering_reminder',
      ])
      expect(await requests()).toBe(before)
    })

    it('a member who mutes a plant loses their waiting reminder, and nobody else does', async () => {
      await plan(shared)

      await as(
        lily,
        mutePlant(mintPermit(shared, 'mute', Actor.User({ userId: lily })))
      )

      expect(await waiting()).toEqual(['alex:shared:watering_reminder'])
    })

    it('a member who unmutes a plant is reminded again', async () => {
      await db
        .insert(schema.canopyPlantMutes)
        .values({ userId: lily, plantId: shared })
      await plan(shared)
      const whileMuted = await waiting()

      await as(
        lily,
        unmutePlant(mintPermit(shared, 'mute', Actor.User({ userId: lily })))
      )

      expect(whileMuted).toEqual(['alex:shared:watering_reminder'])
      expect(await waiting()).toEqual([
        'alex:shared:watering_reminder',
        'lily:shared:watering_reminder',
      ])
    })

    it('a plant shared into a Canopy reminds every member', async () => {
      await plan(personal)

      await as(
        alex,
        sharePlantWithCanopy(
          mintPermit(personal, 'share', Actor.User({ userId: alex })),
          {}
        )
      )

      expect(await waiting()).toEqual([
        'alex:personal:watering_reminder',
        'lily:personal:watering_reminder',
      ])
    })

    it('a plant taken back from a Canopy leaves only its owner waiting to hear about it', async () => {
      await plan(shared)
      await alsoWaitingForAPhoto([alex, shared], [lily, shared])

      await as(
        alex,
        unsharePlant(
          mintPermit(shared, 'unshare', Actor.User({ userId: alex })),
          {}
        )
      )

      expect(await waiting()).toEqual([
        'alex:shared:photo_reminder',
        'alex:shared:watering_reminder',
      ])
    })

    it('a Canopy that changes timezone has its reminders planned for the new care days', async () => {
      const dueDayIn = (timezone: string) =>
        CareDays.of(DateTime.makeUnsafe(dueAt), timezone)
      const occasions = async () =>
        Array.map(await waitingRows(), (row) => row.occasionDay)
      await db
        .update(schema.canopies)
        .set({ timezone: 'Pacific/Kiritimati' })
        .where(eq(schema.canopies.id, canopyId))
      await plan(shared)
      const before = await occasions()

      await as(alex, updateMyCanopy({ timezone: 'Pacific/Niue' }))

      expect(before).toEqual(Array.replicate(dueDayIn('Pacific/Kiritimati'), 2))
      expect(await occasions()).toEqual(
        Array.replicate(dueDayIn('Pacific/Niue'), 2)
      )
    })

    it('a member who joins is reminded of the Canopy plants', async () => {
      const sam = await user('Sam')
      await plan(shared)
      await db.insert(schema.canopyInvites).values({
        canopyId,
        tokenHash: hashInviteToken('join-the-flat'),
        createdByUserId: alex,
        expiresAt: new Date(Date.now() + DAY_MS),
      })

      await as(
        sam,
        Effect.flatMap(Canopy, (canopy) =>
          canopy.join({
            joiner: sam,
            via: JoinVia.Link({ token: 'join-the-flat' }),
          })
        )
      )

      expect(await waiting()).toEqual([
        'alex:shared:watering_reminder',
        'lily:shared:watering_reminder',
        'sam:shared:watering_reminder',
      ])
    })

    describe('when someone is away', () => {
      const vacationOf = async (
        userId: string,
        vacationStatus: 'scheduled' | 'active'
      ) => {
        const [row] = await db
          .update(schema.users)
          .set({
            vacationStatus,
            vacationStart: new Date(Date.now() - DAY_MS),
            vacationEnd: new Date(Date.now() + 7 * DAY_MS),
          })
          .where(eq(schema.users.id, userId))
          .returning()
        if (!row) throw new Error(`no user ${userId}`)
        return row
      }

      it('someone who leaves on vacation stops being reminded, and the other members are not', async () => {
        await plan(personal, shared)
        const leaving = await vacationOf(alex, 'scheduled')

        await as(alex, activateVacation({ expected: leaving }))

        expect(await waiting()).toEqual(['lily:shared:watering_reminder'])
      })

      it('someone back from vacation is reminded again of their plants and the Canopy plants', async () => {
        const away = await vacationOf(alex, 'active')
        await plan(personal, shared)
        const whileAway = await waiting()

        await as(alex, endVacation({ user: away, effectiveEnd: new Date() }))

        expect(whileAway).toEqual(['lily:shared:watering_reminder'])
        expect(await waiting()).toEqual([
          'alex:personal:watering_reminder',
          'alex:shared:watering_reminder',
          'lily:shared:watering_reminder',
        ])
      })
    })

    describe('when someone changes their settings', () => {
      const sendHours = async () =>
        Array.map(
          await db
            .select({
              userId: schema.notifications.userId,
              scheduledAt: schema.notifications.scheduledAt,
            })
            .from(schema.notifications),
          (row) => `${labels.get(row.userId)}:${row.scheduledAt.getUTCHours()}`
        ).sort()

      it('someone who turns care reminders off stops being reminded, and the other members are not', async () => {
        await plan(personal, shared)

        await as(
          alex,
          updateUserSettings({ notifications: { careReminders: false } })
        )

        expect(await waiting()).toEqual(['lily:shared:watering_reminder'])
      })

      it('someone who moves their send time moves their own reminders and nobody else reminders', async () => {
        await plan(personal, shared)

        await as(
          alex,
          updateUserSettings({ preferredNotificationTime: '14:00' })
        )

        expect(await sendHours()).toEqual(['alex:14', 'alex:14', 'lily:9'])
      })

      it('someone who sets quiet hours over their send time is reminded when they end', async () => {
        await plan(personal, shared)

        await as(
          alex,
          updateUserSettings({
            notifications: {
              doNotDisturb: true,
              doNotDisturbStart: '08:00',
              doNotDisturbEnd: '10:00',
            },
          })
        )

        expect(await sendHours()).toEqual(['alex:10', 'alex:10', 'lily:9'])
      })
    })

    describe('when an account is deleted', () => {
      const tendedBy = async (caretakerId: string, plantId: string) => {
        const [delegation] = await db
          .insert(schema.careDelegations)
          .values({
            ownerId: alex,
            caretakerId,
            status: 'active',
            startDate: new Date(Date.now() - DAY_MS),
            endDate: new Date(Date.now() + 7 * DAY_MS),
          })
          .returning()
        if (!delegation) throw new Error('Failed to create delegation')
        await db
          .insert(schema.delegationPlants)
          .values({ delegationId: delegation.id, plantId })
      }

      it('someone who asks for their account to be deleted is told nothing more, and the Canopy still is', async () => {
        await plan(personal, shared)
        await alsoWaitingForAPhoto([alex, personal], [lily, shared])

        await as(alex, deleteAccount())

        expect(await waiting()).toEqual([
          'lily:shared:photo_reminder',
          'lily:shared:watering_reminder',
        ])
      })

      it('someone outside any Canopy who asks for their account to be deleted is told nothing more', async () => {
        const sam = await user('Sam')
        const sams = await plant('sams', { userId: sam }, sam)
        await plan(sams)
        const before = await waiting()

        await as(sam, deleteAccount())

        expect(before).toEqual(['sam:sams:watering_reminder'])
        expect(await waiting()).toEqual([])
      })

      it('a caretaker who asks for their account to be deleted hands the plant back to its owner', async () => {
        await tendedBy(lily, personal)
        await plan(personal, shared)
        const whileTended = await waiting()

        await as(lily, deleteAccount())

        expect(whileTended).toEqual([
          'alex:shared:watering_reminder',
          'lily:personal:watering_reminder',
          'lily:shared:watering_reminder',
        ])
        expect(await waiting()).toEqual([
          'alex:personal:watering_reminder',
          'alex:shared:watering_reminder',
        ])
      })

      it('a caretaker whose account is deleted for good hands the plant back to its owner', async () => {
        await tendedBy(lily, personal)
        await plan(personal, shared)

        await as(alex, purgeAccount(lily))

        expect(await waiting()).toEqual([
          'alex:personal:watering_reminder',
          'alex:shared:watering_reminder',
        ])
      })
    })

    describe('when Canopy says what changed', () => {
      const theFlat = (): PlantOwner => ({
        _tag: 'Canopy',
        canopyId: CanopyId.make(canopyId),
      })
      const canopySays = (...events: ReadonlyArray<CanopyEvent>) =>
        as(
          alex,
          transact(
            Effect.flatMap(Outbox, (outbox) =>
              outbox.append(CanopyTopic, events)
            )
          )
        )

      it('plants that moved are planned again for whoever holds them now', async () => {
        await plan(personal, shared)
        await db
          .update(schema.plants)
          .set({ userId: null, canopyId })
          .where(eq(schema.plants.id, personal))
        await db
          .update(schema.plants)
          .set({ userId: alex, canopyId: null })
          .where(eq(schema.plants.id, shared))

        await canopySays(
          {
            _tag: 'PlantsMoved',
            plantIds: [personal],
            from: { _tag: 'User', userId: alex },
            to: theFlat(),
          },
          {
            _tag: 'PlantsMoved',
            plantIds: [shared],
            from: theFlat(),
            to: { _tag: 'User', userId: alex },
          }
        )

        expect(await waiting()).toEqual([
          'alex:personal:watering_reminder',
          'alex:shared:watering_reminder',
          'lily:personal:watering_reminder',
        ])
      })

      it('a member who left loses their reminders on the plants that stayed, and nobody else does', async () => {
        await plan(shared)
        await db
          .delete(schema.canopyMembers)
          .where(eq(schema.canopyMembers.userId, lily))

        await canopySays({
          _tag: 'MemberLeft',
          canopyId,
          userId: lily,
          reason: 'left',
        })

        expect(await waiting()).toEqual(['alex:shared:watering_reminder'])
      })
    })

    describe('when a Canopy and a member part', () => {
      let lilys: string

      beforeEach(async () => {
        lilys = await plant('lilys', { canopyId }, lily)
        await plan(shared, lilys)
        await alsoWaitingForAPhoto(
          [alex, shared],
          [lily, shared],
          [alex, lilys],
          [lily, lilys]
        )
      })

      const eachHearsOfTheirOwnPlantOnly = [
        'alex:shared:photo_reminder',
        'alex:shared:watering_reminder',
        'lily:lilys:photo_reminder',
        'lily:lilys:watering_reminder',
      ]

      it('a member who leaves takes their plant, and each side stops hearing about the other plant', async () => {
        await as(lily, leave(lily))

        expect(await waiting()).toEqual(eachHearsOfTheirOwnPlantOnly)
      })

      it('a dissolved Canopy leaves each plant to one user, the only one still told about it', async () => {
        await as(alex, deleteMyCanopy())

        expect(await waiting()).toEqual(eachHearsOfTheirOwnPlantOnly)
      })
    })
  }
)
