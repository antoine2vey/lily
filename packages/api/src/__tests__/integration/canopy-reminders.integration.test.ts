import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { createMockPushService } from '@lily/api/__tests__/mocks/push.service'
import { ActivityPushTokenRepositoryLive } from '@lily/api/repositories/activity-push-token.repository'
import {
  CanopyRepository,
  CanopyRepositoryLive,
} from '@lily/api/repositories/canopy.repository'
import {
  CareLogRepository,
  CareLogRepositoryLive,
} from '@lily/api/repositories/care-log.repository'
import {
  CareScheduleRepository,
  CareScheduleRepositoryLive,
  type OverdueRecipientPlant,
} from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { DeviceTokenRepositoryLive } from '@lily/api/repositories/device-token.repository'
import {
  NotificationRepository,
  NotificationRepositoryLive,
} from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { processMessage } from '@lily/api/services/notification-scheduler/worker'
import { scheduleCareReminder } from '@lily/api/services/plants/helpers/schedule-care-reminder'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import type { PushMessage } from '@lily/shared/server'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import {
  Array as Arr,
  Effect,
  Layer,
  Option,
  Order,
  pipe,
  Record,
  References,
} from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

const RepositoriesLive = Layer.mergeAll(
  CareScheduleRepositoryLive,
  CanopyRepositoryLive,
  NotificationRepositoryLive,
  CareLogRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const run = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    | CareScheduleRepository
    | CanopyRepository
    | NotificationRepository
    | CareLogRepository
  >
) => Effect.runPromise(effect.pipe(Effect.provide(RepositoriesLive)))

const WorkerLive = Layer.mergeAll(
  CareScheduleRepositoryLive,
  CanopyRepositoryLive,
  NotificationRepositoryLive,
  CareLogRepositoryLive,
  PlantRepositoryLive,
  UserRepositoryLive,
  DeviceTokenRepositoryLive,
  ActivityPushTokenRepositoryLive,
  DelegationRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Canopy reminder queries - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let alex: string
    let lily: string
    let sam: string
    let canopyId: string
    let shared: string
    let mutedPlant: string
    let personal: string

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
        })
        .returning()
      if (!row) throw new Error(`Failed to create ${name}`)
      return row.id
    }

    const plant = async (
      owner: { userId?: string; canopyId?: string },
      name: string
    ) => {
      const [row] = await db
        .insert(schema.plants)
        .values({
          ...(owner.userId ? { userId: owner.userId } : {}),
          ...(owner.canopyId ? { canopyId: owner.canopyId } : {}),
          createdByUserId: alex,
          name,
          health: 'HEALTHY',
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
        })
        .returning()
      if (!row) throw new Error(`Failed to create plant ${name}`)
      await db.insert(schema.plantCareSchedules).values({
        plantId: row.id,
        careType: 'watering',
        frequencyDays: 7,
        nextCareAt: new Date(Date.now() - 2 * 86_400_000),
      })
      return row.id
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      for (const table of [
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
      lily = await user('Lily')
      sam = await user('Sam')
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
      shared = await plant({ canopyId }, 'Shared Fern')
      mutedPlant = await plant({ canopyId }, 'Muted Cactus')
      personal = await plant({ userId: alex }, 'Alex Pothos')
      await db
        .insert(schema.canopyPlantMutes)
        .values({ userId: lily, plantId: mutedPlant })
    })

    afterAll(async () => {
      await pool.end()
    })

    it('addresses an overdue Canopy plant to each unmuted member with the Canopy as owner', async () => {
      const grouped = await run(
        Effect.flatMap(CareScheduleRepository, (repo) =>
          repo.findOverdueByUser()
        )
      )
      const plantsOf = (id: string) =>
        pipe(
          Record.get(grouped, id),
          Option.getOrElse((): ReadonlyArray<OverdueRecipientPlant> => [])
        )
      const forUser = (id: string) =>
        pipe(
          plantsOf(id),
          Arr.map((p) => [p.name, p.owner._tag] as const),
          Arr.sort(
            Order.mapInput(
              Order.String,
              (entry: readonly [string, string]) => entry[0]
            )
          )
        )

      expect(forUser(alex)).toEqual([
        ['Alex Pothos', 'User'],
        ['Muted Cactus', 'Canopy'],
        ['Shared Fern', 'Canopy'],
      ])
      expect(forUser(lily)).toEqual([['Shared Fern', 'Canopy']])
      expect(forUser(sam)).toEqual([])
      const canopyOwner = pipe(
        plantsOf(alex),
        Arr.findFirst((p) => p.id === shared),
        Option.map((p) => p.owner),
        Option.getOrNull
      )
      expect(canopyOwner).toEqual({ _tag: 'Canopy', canopyId })
    })

    it('lists unmuted Canopy plants in the member care tasks only when asked', async () => {
      const cutoff = new Date(Date.now() + 86_400_000)
      const [without, withCanopy] = await run(
        Effect.flatMap(CareScheduleRepository, (repo) =>
          Effect.all([
            repo.findPendingByUser(lily, cutoff, null),
            repo.findPendingByUser(lily, cutoff, canopyId),
          ])
        )
      )
      expect(without).toEqual([])
      expect(Arr.map(withCanopy, (s) => s.plant.id)).toEqual([shared])
    })

    it('includes unmuted Canopy schedules with the Canopy owner in findByOwnerWithPlant', async () => {
      const rows = await run(
        Effect.flatMap(CareScheduleRepository, (repo) =>
          repo.findByOwnerWithPlant(lily)
        )
      )
      expect(Arr.map(rows, (r) => [r.plant.id, r.plant.owner._tag])).toEqual([
        [shared, 'Canopy'],
      ])
    })

    it('drops a leaver pending and queued rows for Canopy plants, and nothing else', async () => {
      await db.execute(
        sql`TRUNCATE TABLE notifications RESTART IDENTITY CASCADE`
      )
      const row = (
        userId: string,
        plantId: string,
        status: 'pending' | 'queued' | 'sent'
      ) => ({
        type: 'watering_reminder',
        scheduledAt: new Date(),
        userId,
        plantId,
        status,
      })
      await db
        .insert(schema.notifications)
        .values([
          row(lily, shared, 'pending'),
          row(lily, shared, 'queued'),
          row(lily, shared, 'sent'),
          row(lily, personal, 'pending'),
          row(alex, shared, 'pending'),
        ])
      await run(
        Effect.flatMap(NotificationRepository, (repo) =>
          repo.deleteUndeliveredForMemberOnCanopy(lily, canopyId)
        )
      )
      const left = await db
        .select({
          userId: schema.notifications.userId,
          plantId: schema.notifications.plantId,
          status: schema.notifications.status,
        })
        .from(schema.notifications)
      expect(
        Arr.sort(
          Arr.map(
            left,
            (n) =>
              `${n.userId === lily ? 'lily' : 'alex'}:${n.plantId === shared ? 'shared' : 'personal'}:${n.status}`
          ),
          Order.String
        )
      ).toEqual([
        'alex:shared:pending',
        'lily:personal:pending',
        'lily:shared:sent',
      ])
    })

    it('lists reminder recipients minus the member who muted the plant', async () => {
      const [forShared, forMuted] = await run(
        Effect.flatMap(CanopyRepository, (repo) =>
          Effect.all([
            repo.findReminderRecipients(canopyId, shared),
            repo.findReminderRecipients(canopyId, mutedPlant),
          ])
        )
      )
      expect([...forShared].sort()).toEqual([alex, lily].sort())
      expect(forMuted).toEqual([alex])
    })
    it('counts care done today on living plants only, in both scopes', async () => {
      const dead = await plant({ canopyId }, 'Buried Canopy Palm')
      const deadOwn = await plant({ userId: alex }, 'Buried Alex Ivy')
      await db
        .update(schema.plants)
        .set({ diedAt: new Date() })
        .where(sql`${schema.plants.id} in (${dead}, ${deadOwn})`)
      await db.insert(schema.careLogs).values(
        Arr.map([shared, dead, personal, deadOwn], (plantId) => ({
          plantId,
          type: 'watering' as const,
          date: new Date(),
        }))
      )
      const [withCanopy, personalOnly] = await run(
        Effect.flatMap(CareLogRepository, (repo) =>
          Effect.all([
            repo.countTodayByUser(alex, 'UTC', canopyId),
            repo.countTodayByUser(alex, 'UTC', null),
          ])
        )
      )
      expect(withCanopy).toBe(2)
      expect(personalOnly).toBe(1)
    })

    it('delivers a Canopy care push only to a member who has not muted the plant', async () => {
      await db.execute(
        sql`TRUNCATE TABLE notifications RESTART IDENTITY CASCADE`
      )
      await db.insert(schema.deviceTokens).values(
        Arr.map([alex, lily, sam], (userId) => ({
          token: `ExponentPushToken[delivery-${userId}]`,
          platform: 'ios' as const,
          userId,
        }))
      )
      const deliver = async (userId: string, plantId: string) => {
        const [row] = await db
          .insert(schema.notifications)
          .values({
            type: 'watering_reminder',
            scheduledAt: new Date(),
            userId,
            plantId,
            status: 'queued',
          })
          .returning()
        if (!row) throw new Error('Failed to create notification')
        const sent: PushMessage[] = []
        await Effect.runPromise(
          processMessage({
            id: `msg-${row.id}`,
            topic: 'watering_reminder',
            payload: {
              userId,
              title: 'Water time',
              body: 'Your plants are thirsty',
              notificationIds: [row.id],
              plantIds: [plantId],
            },
            retryCount: 0,
            createdAt: new Date(),
            scheduledAt: new Date(),
          }).pipe(
            Effect.provide(
              Layer.mergeAll(
                WorkerLive,
                MockAlerterLive,
                createMockPushService({
                  onSendBatch: (msgs) => sent.push(...msgs),
                })
              )
            ),
            Effect.provideService(References.MinimumLogLevel, 'None')
          )
        )
        const [after] = await db
          .select({ status: schema.notifications.status })
          .from(schema.notifications)
          .where(sql`${schema.notifications.id} = ${row.id}`)
        return { pushed: sent.length, status: after?.status }
      }

      expect(await deliver(lily, shared)).toEqual({ pushed: 1, status: 'sent' })
      expect(await deliver(lily, mutedPlant)).toEqual({
        pushed: 0,
        status: 'sent',
      })
      expect(await deliver(sam, shared)).toEqual({ pushed: 0, status: 'sent' })
      expect(await deliver(alex, personal)).toEqual({
        pushed: 1,
        status: 'sent',
      })
    })
    it('keeps the old reminder rows when writing the new ones fails', async () => {
      await db.execute(
        sql`TRUNCATE TABLE notifications RESTART IDENTITY CASCADE`
      )
      await db.insert(schema.notifications).values({
        type: 'watering_reminder',
        scheduledAt: new Date(Date.now() + 86_400_000),
        userId: alex,
        plantId: personal,
        status: 'pending',
      })
      const exit = await Effect.runPromiseExit(
        scheduleCareReminder({
          plant: {
            id: personal,
            owner: {
              _tag: 'User',
              userId: '00000000-0000-4000-8000-000000000000',
            },
            remindersEnabled: true,
          },
          type: 'watering_reminder',
          scheduledDate: new Date(Date.now() + 7 * 86_400_000),
        }).pipe(
          Effect.provide(WorkerLive),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )
      const rows = await db
        .select({ userId: schema.notifications.userId })
        .from(schema.notifications)
      expect(exit._tag).toBe('Failure')
      expect(rows).toEqual([{ userId: alex }])
    })
  }
)
