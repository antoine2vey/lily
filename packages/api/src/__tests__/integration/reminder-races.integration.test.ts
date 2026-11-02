import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockPushService } from '@lily/api/__tests__/mocks/push.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import { ActivityPushTokenRepositoryLive } from '@lily/api/repositories/activity-push-token.repository'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CarePlanRepositoryLive } from '@lily/api/repositories/care-plan.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { DeviceTokenRepositoryLive } from '@lily/api/repositories/device-token.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import {
  PlantRepository,
  PlantRepositoryLive,
} from '@lily/api/repositories/plant.repository'
import { RoomRepositoryLive } from '@lily/api/repositories/room.repository'
import {
  UserRepository,
  UserRepositoryLive,
} from '@lily/api/repositories/user.repository'
import { acceptCanopyInvite } from '@lily/api/services/canopy/endpoints/accept-canopy-invite'
import { createCanopyInvite } from '@lily/api/services/canopy/endpoints/create-canopy-invite'
import { processMessage } from '@lily/api/services/notification-scheduler/worker'
import { careMultiplePlants } from '@lily/api/services/plants/endpoints/care-multiple-plants'
import {
  mutePlant,
  unmutePlant,
} from '@lily/api/services/plants/endpoints/mute-plant'
import { revivePlant } from '@lily/api/services/plants/endpoints/revive-plant'
import { unsharePlant } from '@lily/api/services/plants/endpoints/unshare-plant'
import { executePlantCare } from '@lily/api/services/plants/helpers/execute-plant-care'
import { endVacation } from '@lily/api/services/vacation/helpers/end-vacation'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import type { PushMessage } from '@lily/shared/server'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import {
  Array as Arr,
  Cause,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  References,
} from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const day = 86_400_000

const BaseLive = Layer.mergeAll(
  PlantRepositoryLive,
  CareLogRepositoryLive,
  CareScheduleRepositoryLive,
  NotificationRepositoryLive,
  UserRepositoryLive,
  CarePlanRepositoryLive,
  CanopyRepositoryLive,
  DelegationRepositoryLive,
  RoomRepositoryLive,
  DeviceTokenRepositoryLive,
  ActivityPushTokenRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const isDeadlock = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) && Cause.pretty(exit.cause).includes('40P01')

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Reminder rows under concurrent writers - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let runtime: ManagedRuntime.ManagedRuntime<
      Layer.Success<typeof BaseLive>,
      Layer.Error<typeof BaseLive>
    >
    let alex: string
    let lily: string
    let sam: string
    let canopyId: string
    let plants: string[]

    const as = <A, E, R>(userId: string, effect: Effect.Effect<A, E, R>) =>
      runtime.runPromiseExit(
        effect.pipe(
          Effect.provide(
            Layer.mergeAll(
              createMockCurrentUser({ id: userId, name: userId }),
              createMockEventBus(),
              createMockLimitChecker(),
              createMockMessageQueue(),
              createMockWeatherProvider(),
              createMockWeatherCache(),
              createMockWeatherRepository(),
              MockAlerterLive
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        ) as Effect.Effect<A, E, Layer.Success<typeof BaseLive>>
      )

    const plantNamed = (plantId: string) =>
      Effect.flatMap(PlantRepository, (repo) => repo.findById(plantId)).pipe(
        Effect.flatMap((plant) =>
          plant === null
            ? Effect.die(`no plant ${plantId}`)
            : Effect.succeed(plant)
        )
      )

    const deadlocks = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200))
      const [row] = await db
        .execute<{ deadlocks: string }>(
          sql`SELECT deadlocks::text AS deadlocks FROM pg_stat_database WHERE datname = current_database()`
        )
        .then((r) => r.rows)
      return Number(row?.deadlocks ?? 0)
    }

    const user = async (name: string, timezone = 'UTC') => {
      const [row] = await db
        .insert(schema.users)
        .values({
          email: `${name.toLowerCase()}-${Date.now()}-${Math.random()}@example.com`,
          name,
          emailVerified: true,
          role: 'user',
          status: 'active',
          timezone,
          careReminders: true,
          preferredNotificationTime: '09:00',
        })
        .returning()
      if (!row) throw new Error(`Failed to create ${name}`)
      return row.id
    }

    const pendingRows = () =>
      db
        .select({
          userId: schema.notifications.userId,
          plantId: schema.notifications.plantId,
          type: schema.notifications.type,
        })
        .from(schema.notifications)
        .where(sql`${schema.notifications.status} = 'pending'`)

    const reset = async () => {
      await db.execute(
        sql`TRUNCATE TABLE notifications, care_logs RESTART IDENTITY CASCADE`
      )
      await db.execute(sql`DELETE FROM canopy_members WHERE user_id = ${sam}`)
      await db.execute(sql`DELETE FROM canopy_plant_mutes`)
      await db.execute(
        sql`UPDATE plants SET canopy_id = ${canopyId}, user_id = NULL, died_at = NULL, reminders_enabled = true WHERE id IN (${sql.join(
          Arr.map(plants, (p) => sql`${p}`),
          sql`, `
        )})`
      )
      await db.execute(
        sql`UPDATE plant_care_schedules SET next_care_at = now() + interval '3 days', last_care_at = now() - interval '4 days'`
      )
      await db.execute(
        sql`UPDATE users SET vacation_status = 'none', vacation_start = NULL, vacation_end = NULL`
      )
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      runtime = ManagedRuntime.make(BaseLive)
      for (const table of [
        'notifications',
        'care_logs',
        'plant_care_schedules',
        'canopy_plant_mutes',
        'canopy_invites',
        'canopy_members',
        'plants',
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
      plants = []
      for (const i of Arr.range(1, 6)) {
        const [row] = await db
          .insert(schema.plants)
          .values({
            canopyId,
            createdByUserId: alex,
            name: `Shared ${i}`,
            health: 'HEALTHY',
            humidityRating: 3,
            lightingRating: 3,
            petToxicityRating: 1,
            wateringRating: 3,
          })
          .returning()
        if (!row) throw new Error('Failed to create plant')
        plants.push(row.id)
        await db.insert(schema.plantCareSchedules).values({
          plantId: row.id,
          careType: 'watering',
          frequencyDays: 7,
        })
      }
    })

    beforeEach(reset)

    afterAll(async () => {
      await runtime.dispose()
      await pool.end()
    })

    const shuffled = (ids: ReadonlyArray<string>, seed: number) =>
      Arr.sort(
        Arr.map(ids, (id, i) => [id, (i * 7919 + seed * 104729) % 97] as const),
        (a: readonly [string, number], b: readonly [string, number]) =>
          a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0
      ).map(([id]) => id)

    it('bulk cares over the same plants in different orders never deadlock', async () => {
      const before = await deadlocks()
      const exits = []
      for (const round of Arr.range(1, 8)) {
        exits.push(
          ...(await Promise.all([
            as(
              alex,
              careMultiplePlants({
                plantIds: shuffled(plants, round),
                careType: 'watering',
              })
            ),
            as(
              lily,
              careMultiplePlants({
                plantIds: Arr.reverse(shuffled(plants, round)),
                careType: 'watering',
              })
            ),
          ]))
        )
      }
      expect(Arr.filter(exits, isDeadlock)).toHaveLength(0)
      expect(Arr.filter(exits, Exit.isFailure)).toHaveLength(0)
      expect((await deadlocks()) - before).toBe(0)
    }, 60_000)

    it('an unshare racing care on the same plant never deadlocks', async () => {
      const before = await deadlocks()
      const exits = []
      for (const round of Arr.range(1, 20)) {
        await reset()
        const target = plants[round % plants.length] as string
        await db.insert(schema.notifications).values(
          Arr.map([alex, lily], (userId) => ({
            type: 'watering_reminder',
            scheduledAt: new Date(Date.now() + day),
            userId,
            plantId: target,
            status: 'pending' as const,
          }))
        )
        exits.push(
          ...(await Promise.all([
            as(
              alex,
              Effect.flatMap(plantNamed(target), (plant) =>
                unsharePlant(plant, {})
              )
            ),
            as(
              lily,
              Effect.flatMap(plantNamed(target), (plant) =>
                executePlantCare(plant, {
                  plantId: target,
                  careType: 'watering',
                  date: new Date(Date.now() - day),
                })
              )
            ),
            as(
              lily,
              careMultiplePlants({ plantIds: plants, careType: 'watering' })
            ),
          ]))
        )
      }
      expect(Arr.filter(exits, isDeadlock)).toHaveLength(0)
      expect((await deadlocks()) - before).toBe(0)
    }, 60_000)

    it('an unmute racing an unshare never leaves the former member a row', async () => {
      let stale = 0
      for (const round of Arr.range(1, 30)) {
        await reset()
        const target = plants[round % plants.length] as string
        await as(
          lily,
          Effect.flatMap(plantNamed(target), (plant) => mutePlant(plant))
        )
        await Promise.all([
          as(
            lily,
            Effect.flatMap(plantNamed(target), (plant) => unmutePlant(plant))
          ),
          as(
            alex,
            Effect.flatMap(plantNamed(target), (plant) =>
              unsharePlant(plant, {})
            )
          ),
        ])
        const rows = await pendingRows()
        stale += Arr.filter(
          rows,
          (r) => r.plantId === target && r.userId === lily
        ).length
      }
      expect(stale).toBe(0)
    }, 60_000)

    it('a joiner never keeps a reminder for a date another member just moved', async () => {
      let stale = 0
      for (const round of Arr.range(1, 10)) {
        await reset()
        const invite = await as(alex, createCanopyInvite())
        if (Exit.isFailure(invite)) throw new Error(Cause.pretty(invite.cause))
        const token = invite.value.url.split('/').at(-1) as string
        const target = plants[round % plants.length] as string
        await Promise.all([
          as(sam, acceptCanopyInvite(token)),
          as(
            lily,
            Effect.flatMap(plantNamed(target), (plant) =>
              executePlantCare(plant, {
                plantId: target,
                careType: 'watering',
              })
            )
          ),
        ])
        const [schedule] = await db
          .select({ next: schema.plantCareSchedules.nextCareAt })
          .from(schema.plantCareSchedules)
          .where(sql`${schema.plantCareSchedules.plantId} = ${target}`)
        const samRows = await db
          .select({ scheduledAt: schema.notifications.scheduledAt })
          .from(schema.notifications)
          .where(
            sql`${schema.notifications.userId} = ${sam} AND ${schema.notifications.plantId} = ${target} AND ${schema.notifications.status} = 'pending'`
          )
        const dueDay = schedule?.next?.toISOString().slice(0, 10)
        stale += Arr.filter(
          samRows,
          (r) => r.scheduledAt.toISOString().slice(0, 10) !== dueDay
        ).length
      }
      expect(stale).toBe(0)
    }, 60_000)

    it('a merged digest whose claimed rows miss a plant does not name it', async () => {
      const [mine, other] = plants as [string, string]
      await db.execute(
        sql`UPDATE plants SET canopy_id = NULL, user_id = ${alex} WHERE id IN (${mine}, ${other})`
      )
      await db.execute(sql`UPDATE plants SET name = 'Fern' WHERE id = ${mine}`)
      await db.execute(
        sql`UPDATE plants SET name = 'Gone Cactus' WHERE id = ${other}`
      )
      await db
        .insert(schema.deviceTokens)
        .values({
          token: `ExponentPushToken[digest-${alex}]`,
          platform: 'ios',
          userId: alex,
        })
        .onConflictDoNothing()
      const [kept, replaced] = await db
        .insert(schema.notifications)
        .values(
          Arr.map([mine, other], (plantId) => ({
            type: 'watering_reminder',
            scheduledAt: new Date(),
            userId: alex,
            plantId,
            status: 'queued' as const,
          }))
        )
        .returning()
      if (!kept || !replaced) throw new Error('rows')
      await db.execute(sql`DELETE FROM notifications WHERE id = ${replaced.id}`)
      const sent: PushMessage[] = []
      await runtime.runPromise(
        processMessage({
          id: `digest-${kept.id}`,
          topic: 'watering_reminder',
          payload: {
            userId: alex,
            title: 'Water time',
            body: 'Fern, Gone Cactus',
            notificationIds: [kept.id, replaced.id],
            plantIds: [mine, other],
          },
          retryCount: 0,
          createdAt: new Date(),
          scheduledAt: new Date(),
        }).pipe(
          Effect.provide(
            Layer.mergeAll(
              MockAlerterLive,
              createMockPushService({ onSendBatch: (m) => sent.push(...m) })
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        ) as Effect.Effect<void, never, Layer.Success<typeof BaseLive>>
      )
      expect(sent.length).toBeGreaterThan(0)
      expect(`${sent[0]?.title} ${sent[0]?.body}`).not.toContain('Gone Cactus')
    }, 60_000)

    it('a mixed storm leaves one pending row per recipient and no deadlock', async () => {
      const before = await deadlocks()
      const failures: string[] = []
      for (const round of Arr.range(1, 5)) {
        await reset()
        const invite = await as(alex, createCanopyInvite())
        if (Exit.isFailure(invite)) throw new Error(Cause.pretty(invite.cause))
        const token = invite.value.url.split('/').at(-1) as string
        const [p1, p2, p3, p4, p5, p6] = plants as [
          string,
          string,
          string,
          string,
          string,
          string,
        ]
        await as(
          lily,
          Effect.flatMap(plantNamed(p2), (p) => mutePlant(p))
        )
        await db.execute(
          sql`UPDATE plants SET died_at = now() WHERE id = ${p6}`
        )
        await db.execute(
          sql`UPDATE users SET vacation_status = 'active', vacation_start = date_trunc('milliseconds', now() - interval '2 days'), vacation_end = date_trunc('milliseconds', now() + interval '2 days') WHERE id = ${lily}`
        )
        const lilyUser = await runtime.runPromise(
          Effect.flatMap(UserRepository, (repo) => repo.findById(lily))
        )
        if (!lilyUser) throw new Error('lily')
        const backDated = (days: number) => new Date(Date.now() - days * day)
        const jobs = Arr.flatten(
          Arr.map(Arr.range(1, 3), (k) => [
            as(
              alex,
              careMultiplePlants({
                plantIds: shuffled(plants.slice(0, 5), round * 10 + k),
                careType: 'watering',
              })
            ),
            as(
              lily,
              careMultiplePlants({
                plantIds: shuffled(plants.slice(0, 5), round * 20 + k),
                careType: 'watering',
              })
            ),
            as(
              alex,
              Effect.flatMap(plantNamed(plants[k] as string), (plant) =>
                executePlantCare(plant, {
                  plantId: plant.id,
                  careType: 'watering',
                  date: backDated(k),
                })
              )
            ),
          ])
        )
        const exits: ReadonlyArray<Exit.Exit<unknown, unknown>> =
          await Promise.all([
            ...jobs,
            as(sam, acceptCanopyInvite(token)),
            as(
              lily,
              Effect.flatMap(plantNamed(p2), (p) => unmutePlant(p))
            ),
            as(lily, endVacation({ user: lilyUser, effectiveEnd: new Date() })),
            as(
              alex,
              Effect.flatMap(plantNamed(p5), (p) => unsharePlant(p, {}))
            ),
            as(
              alex,
              Effect.flatMap(plantNamed(p6), (p) => revivePlant(p))
            ),
            as(
              lily,
              Effect.flatMap(plantNamed(p1), (p) => mutePlant(p))
            ),
            as(
              lily,
              Effect.flatMap(plantNamed(p1), (p) => unmutePlant(p))
            ),
            as(
              alex,
              careMultiplePlants({
                plantIds: [p3, p4, p1],
                careType: 'watering',
              })
            ),
            as(
              lily,
              careMultiplePlants({
                plantIds: [p4, p3, p2],
                careType: 'watering',
              })
            ),
            as(
              alex,
              Effect.flatMap(plantNamed(p4), (plant) =>
                executePlantCare(plant, {
                  plantId: p4,
                  careType: 'watering',
                  date: backDated(4),
                })
              )
            ),
            as(
              lily,
              Effect.flatMap(plantNamed(p3), (plant) =>
                executePlantCare(plant, {
                  plantId: p3,
                  careType: 'watering',
                  date: backDated(1),
                })
              )
            ),
          ])
        expect(exits).toHaveLength(20)
        Arr.forEach(exits, (exit, i) => {
          if (isDeadlock(exit)) failures.push(`round ${round}: deadlock`)
          else if (Exit.isFailure(exit))
            failures.push(
              `round ${round} job ${i}: ${Cause.pretty(exit.cause)}`
            )
        })
        const members = await db
          .select({ userId: schema.canopyMembers.userId })
          .from(schema.canopyMembers)
        const mutes = await db.select().from(schema.canopyPlantMutes)
        const plantRows = await db
          .select({
            id: schema.plants.id,
            userId: schema.plants.userId,
            canopyId: schema.plants.canopyId,
            diedAt: schema.plants.diedAt,
          })
          .from(schema.plants)
        const rows = await pendingRows()
        for (const plant of plantRows) {
          if (plant.diedAt !== null) continue
          const recipients =
            plant.canopyId === null
              ? [plant.userId as string]
              : Arr.filter(
                  Arr.map(members, (m) => m.userId),
                  (u) =>
                    !Arr.some(
                      mutes,
                      (m) => m.userId === u && m.plantId === plant.id
                    )
                )
          const got = Arr.filter(
            rows,
            (r) => r.plantId === plant.id && r.type === 'watering_reminder'
          )
          const counts = Arr.map(
            recipients,
            (u) => Arr.filter(got, (r) => r.userId === u).length
          )
          const strangers = Arr.filter(
            got,
            (r) => !Arr.contains(recipients, r.userId)
          ).length
          if (!Arr.every(counts, (n) => n === 1) || strangers > 0) {
            failures.push(
              `round ${round} plant ${plant.id.slice(0, 8)}: per recipient ${JSON.stringify(counts)}, strangers ${strangers}`
            )
          }
        }
      }
      expect(failures).toEqual([])
      expect((await deadlocks()) - before).toBe(0)
    }, 60_000)
  }
)
