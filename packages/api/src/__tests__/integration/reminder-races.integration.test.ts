import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import {
  absenceOverStore,
  leaveOnVacation,
  returnFromVacation,
} from '@lily/api/__tests__/integration/absence-layers'
import {
  delivered,
  leaveForDeletion,
} from '@lily/api/__tests__/integration/canopy-layers'
import {
  removeAsCurrentUser,
  reviveAsCurrentUser,
  waterAsCurrentUser,
} from '@lily/api/__tests__/integration/care-layers'
import { careDayOf } from '@lily/api/__tests__/integration/care-rows'
import {
  deadlocks,
  sessionsWaitingForALock,
  waitsForALock,
} from '@lily/api/__tests__/integration/lock-waits'
import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockPushService } from '@lily/api/__tests__/mocks/push.service'
import { createMockRateLimiterService } from '@lily/api/__tests__/mocks/rate-limiter.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import { CanopyLive } from '@lily/api/contexts/canopy'
import {
  CareReads,
  CareReadsLive,
  type DueQuery,
} from '@lily/api/contexts/care'
import { replanPlants } from '@lily/api/contexts/reminders'
import { Actor, mintPermit } from '@lily/api/kernel/permit'
import { ActivityPushTokenRepositoryLive } from '@lily/api/repositories/activity-push-token.repository'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CarePlanRepositoryLive } from '@lily/api/repositories/care-plan.repository'
import {
  CareScheduleRepository,
  CareScheduleRepositoryLive,
} from '@lily/api/repositories/care-schedule.repository'
import {
  DelegationRepository,
  DelegationRepositoryLive,
} from '@lily/api/repositories/delegation.repository'
import { DeviceTokenRepositoryLive } from '@lily/api/repositories/device-token.repository'
import {
  NotificationRepository,
  NotificationRepositoryLive,
} from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { RoomRepositoryLive } from '@lily/api/repositories/room.repository'
import { SubscriptionRepositoryLive } from '@lily/api/repositories/subscription.repository'
import {
  UserRepository,
  UserRepositoryLive,
} from '@lily/api/repositories/user.repository'
import { acceptCanopyInvite } from '@lily/api/services/canopy/endpoints/accept-canopy-invite'
import { createCanopyInvite } from '@lily/api/services/canopy/endpoints/create-canopy-invite'
import { deleteMyCanopy } from '@lily/api/services/canopy/endpoints/delete-my-canopy'
import { cancelDelegation } from '@lily/api/services/delegation/endpoints/cancel-delegation'
import { pollAndTransition } from '@lily/api/services/delegation-scheduler/scheduler'
import { processMessage } from '@lily/api/services/notification-scheduler/worker'
import { checkAndCreateOverdueReminders } from '@lily/api/services/overdue-scheduler/scheduler'
import { careMultiplePlants } from '@lily/api/services/plants/endpoints/care-multiple-plants'
import {
  mutePlant,
  unmutePlant,
} from '@lily/api/services/plants/endpoints/mute-plant'
import { unsharePlant } from '@lily/api/services/plants/endpoints/unshare-plant'
import { updateUserSettings } from '@lily/api/services/user/endpoints/update-user-settings'
import { purgeAccount } from '@lily/api/services/user/helpers/purge-account'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import type { PushMessage } from '@lily/shared/server'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import {
  Array as Arr,
  Cause,
  Deferred,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Match,
  Order,
  References,
} from 'effect'
import { SqlError } from 'effect/sql/SqlError'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const day = 86_400_000

const BaseLive = Layer.mergeAll(
  PlantRepositoryLive,
  CareLogRepositoryLive,
  CareScheduleRepositoryLive,
  CareReadsLive,
  NotificationRepositoryLive,
  UserRepositoryLive,
  CarePlanRepositoryLive,
  CanopyRepositoryLive,
  DelegationRepositoryLive,
  RoomRepositoryLive,
  DeviceTokenRepositoryLive,
  ActivityPushTokenRepositoryLive,
  SubscriptionRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const outcome = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.match(exit, {
    onSuccess: () => 'ok',
    onFailure: (cause) => {
      const error = Cause.squash(cause)
      return error instanceof SqlError ? error.reason._tag : 'failed'
    },
  })

const isDeadlock = (exit: Exit.Exit<unknown, unknown>) =>
  outcome(exit) === 'DeadlockError'

const aZoneOnAnotherDayThanUtc = () =>
  new Date().getUTCHours() >= 10 ? 'Pacific/Kiritimati' : 'Pacific/Pago_Pago'

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
        delivered(effect).pipe(
          Effect.provide(
            Layer.mergeAll(
              createMockCurrentUser({ id: userId, name: userId }),
              createMockEventBus(),
              createMockLimitChecker(),
              createMockMessageQueue(),
              createMockWeatherProvider(),
              createMockWeatherCache(),
              createMockWeatherRepository(),
              createMockRateLimiterService(),
              MockAlerterLive
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        ) as Effect.Effect<A, E, Layer.Success<typeof BaseLive>>
      )

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
        sql`UPDATE plant_care_schedules SET next_care_at = now() + interval '3 days', due_day = ((now() + interval '3 days') AT TIME ZONE 'UTC')::date, last_care_at = now() - interval '4 days'`
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
        const dueAt = new Date()
        await db.insert(schema.plantCareSchedules).values({
          plantId: row.id,
          careType: 'watering',
          frequencyDays: 7,
          nextCareAt: dueAt,
          dueDay: careDayOf(dueAt),
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
      const before = await deadlocks(pool)
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
      expect((await deadlocks(pool)) - before).toBe(0)
    }, 60_000)

    it('an unshare racing care on the same plant never deadlocks', async () => {
      const before = await deadlocks(pool)
      const exits = []
      for (const round of Arr.range(1, 20)) {
        await reset()
        const target = plants[round % plants.length] as string
        await db.insert(schema.notifications).values(
          Arr.map([alex, lily], (userId) => ({
            type: 'watering_reminder' as const,
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
              unsharePlant(
                mintPermit(target, 'unshare', Actor.User({ userId: alex })),
                {}
              )
            ),
            as(lily, waterAsCurrentUser(target, new Date(Date.now() - day))),
            as(
              lily,
              careMultiplePlants({ plantIds: plants, careType: 'watering' })
            ),
          ]))
        )
      }
      expect(Arr.filter(exits, isDeadlock)).toHaveLength(0)
      expect((await deadlocks(pool)) - before).toBe(0)
    }, 60_000)

    it('an unmute racing an unshare never leaves the former member a row', async () => {
      let stale = 0
      const unmutes = []
      for (const round of Arr.range(1, 30)) {
        await reset()
        const target = plants[round % plants.length] as string
        await as(
          lily,
          mutePlant(mintPermit(target, 'mute', Actor.User({ userId: lily })))
        )
        const [unmuted] = await Promise.all([
          as(
            lily,
            unmutePlant(
              mintPermit(target, 'mute', Actor.User({ userId: lily }))
            )
          ),
          as(
            alex,
            unsharePlant(
              mintPermit(target, 'unshare', Actor.User({ userId: alex })),
              {}
            )
          ),
        ])
        unmutes.push(unmuted)
        const rows = await pendingRows()
        stale += Arr.filter(
          rows,
          (r) => r.plantId === target && r.userId === lily
        ).length
      }
      expect(stale).toBe(0)
      expect(
        Arr.filter(
          unmutes,
          (exit) =>
            !Exit.isSuccess(exit) &&
            !(
              Exit.hasFails(exit) &&
              failureOf(exit)._tag === 'PlantNotFoundError'
            )
        )
      ).toEqual([])
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
          as(lily, waterAsCurrentUser(target)),
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
      await db.execute(
        sql`UPDATE plant_care_schedules SET next_care_at = now(), due_day = (now() AT TIME ZONE 'UTC')::date WHERE plant_id IN (${mine}, ${other})`
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
            type: 'watering_reminder' as const,
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
      const before = await deadlocks(pool)
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
          mutePlant(mintPermit(p2, 'mute', Actor.User({ userId: lily })))
        )
        await db.execute(
          sql`UPDATE plants SET died_at = now() WHERE id = ${p6}`
        )
        await db.execute(
          sql`UPDATE users SET vacation_status = 'active', vacation_start = date_trunc('milliseconds', now() - interval '2 days'), vacation_end = date_trunc('milliseconds', now() + interval '2 days') WHERE id = ${lily}`
        )
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
            as(alex, waterAsCurrentUser(plants[k] as string, backDated(k))),
          ])
        )
        const exits: ReadonlyArray<Exit.Exit<unknown, unknown>> =
          await Promise.all([
            ...jobs,
            as(sam, acceptCanopyInvite(token)),
            as(
              lily,
              unmutePlant(mintPermit(p2, 'mute', Actor.User({ userId: lily })))
            ),
            as(lily, returnFromVacation(lily)),
            as(
              alex,
              unsharePlant(
                mintPermit(p5, 'unshare', Actor.User({ userId: alex })),
                {}
              )
            ),
            as(alex, reviveAsCurrentUser(p6)),
            as(
              lily,
              mutePlant(mintPermit(p1, 'mute', Actor.User({ userId: lily })))
            ),
            as(
              lily,
              unmutePlant(mintPermit(p1, 'mute', Actor.User({ userId: lily })))
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
            as(alex, waterAsCurrentUser(p4, backDated(4))),
            as(lily, waterAsCurrentUser(p3, backDated(1))),
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
      expect((await deadlocks(pool)) - before).toBe(0)
    }, 60_000)

    it('a vacation that starts while a reconcile runs leaves no care row pending', async () => {
      const [plant] = await db
        .insert(schema.plants)
        .values({
          userId: sam,
          createdByUserId: sam,
          name: 'Personal',
          health: 'HEALTHY',
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
        })
        .returning()
      if (!plant) throw new Error('Failed to create plant')
      const dueAt = new Date(Date.now() + 3 * day)
      await db.insert(schema.plantCareSchedules).values({
        plantId: plant.id,
        careType: 'watering',
        frequencyDays: 7,
        nextCareAt: dueAt,
        dueDay: careDayOf(dueAt),
      })
      const reached = Deferred.makeUnsafe<void>()
      const release = Deferred.makeUnsafe<void>()
      const PausedBeforeReplace = Layer.effect(
        NotificationRepository,
        Effect.map(NotificationRepository, (repo) => ({
          ...repo,
          writeReminders: (writes) =>
            Deferred.succeed(reached, undefined).pipe(
              Effect.andThen(Deferred.await(release)),
              Effect.andThen(repo.writeReminders(writes))
            ),
        }))
      )
      const reconcile = as(
        sam,
        replanPlants([plant.id]).pipe(Effect.provide(PausedBeforeReplace))
      )
      await Effect.runPromise(Deferred.await(reached))
      const vacation = as(
        sam,
        leaveOnVacation(sam, {
          start: new Date(Date.now() - day),
          end: new Date(Date.now() + 7 * day),
        })
      )
      await waitsForALock(pool, vacation)
      Deferred.doneUnsafe(release, Exit.void)
      const exits: ReadonlyArray<Exit.Exit<unknown, unknown>> =
        await Promise.all([reconcile, vacation])

      expect(Arr.filter(exits, Exit.isFailure)).toHaveLength(0)
      expect(
        Arr.filter(await pendingRows(), (row) => row.plantId === plant.id)
      ).toEqual([])
    }, 60_000)

    const personalPlant = async (ownerId: string) => {
      const [row] = await db
        .insert(schema.plants)
        .values({
          userId: ownerId,
          createdByUserId: ownerId,
          name: 'Personal',
          health: 'HEALTHY',
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
        })
        .returning()
      if (!row) throw new Error('Failed to create plant')
      const dueAt = new Date(Date.now() + 3 * day)
      await db.insert(schema.plantCareSchedules).values({
        plantId: row.id,
        careType: 'watering',
        frequencyDays: 7,
        nextCareAt: dueAt,
        dueDay: careDayOf(dueAt),
      })
      return row.id
    }

    const pendingWatering = (userId: string, plantId: string) =>
      db.insert(schema.notifications).values({
        type: 'watering_reminder',
        scheduledAt: new Date(Date.now() + day),
        userId,
        plantId,
        status: 'pending',
      })

    const startVacation = (userId: string) =>
      as(
        userId,
        leaveOnVacation(userId, {
          start: new Date(Date.now() - day),
          end: new Date(Date.now() + 7 * day),
        })
      )

    const overdueLandsAfterKeys = (userId: string, plantId: string) =>
      Layer.effect(
        NotificationRepository,
        Effect.map(NotificationRepository, (repo) => ({
          ...repo,
          lockReminders: (query) =>
            Effect.promise(() =>
              db.insert(schema.notifications).values({
                type: 'overdue_reminder',
                scheduledAt: new Date(),
                userId,
                plantId,
                status: 'pending',
              })
            ).pipe(
              Effect.when(
                Effect.succeed(Arr.contains(query.plantIds, plantId))
              ),
              Effect.andThen(repo.lockReminders(query))
            ),
        }))
      )

    const pausedBeforeLocking = (
      userId: string,
      reached: Deferred.Deferred<void>,
      release: Deferred.Deferred<void>
    ) =>
      Layer.effect(
        UserRepository,
        Effect.map(UserRepository, (repo) => ({
          ...repo,
          findByIdsForKeyShare: (ids) =>
            Arr.contains(ids, userId)
              ? Deferred.succeed(reached, undefined).pipe(
                  Effect.andThen(Deferred.await(release)),
                  Effect.andThen(repo.findByIdsForKeyShare(ids))
                )
              : repo.findByIdsForKeyShare(ids),
        }))
      )

    it('a vacation that starts while a bulk care rebuilds a delegated plant never deadlocks', async () => {
      const before = await deadlocks(pool)
      const failures: string[] = []
      for (const round of Arr.range(1, 10)) {
        const owner = await user(`Owner${round}`)
        const caretaker = await user(`Caretaker${round}`)
        const [first, second] = Arr.sort(
          [await personalPlant(owner), await personalPlant(owner)],
          (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
        ) as [string, string]
        const [delegation] = await db
          .insert(schema.careDelegations)
          .values({
            ownerId: owner,
            caretakerId: caretaker,
            status: 'active',
            startDate: new Date(Date.now() - day),
            endDate: new Date(Date.now() + 7 * day),
          })
          .returning()
        if (!delegation) throw new Error('Failed to create delegation')
        await db
          .insert(schema.delegationPlants)
          .values({ delegationId: delegation.id, plantId: second })
        await pendingWatering(caretaker, first)

        const reached = Deferred.makeUnsafe<void>()
        const release = Deferred.makeUnsafe<void>()
        const PausedAfterFirstReplace = Layer.effect(
          NotificationRepository,
          Effect.map(NotificationRepository, (repo) => ({
            ...repo,
            writeReminders: (writes) =>
              repo
                .writeReminders(writes)
                .pipe(
                  Effect.andThen(Deferred.succeed(reached, undefined)),
                  Effect.andThen(Deferred.await(release))
                ),
          }))
        )
        const care = as(
          owner,
          delivered(
            careMultiplePlants({
              plantIds: [first, second],
              careType: 'watering',
            })
          ).pipe(Effect.provide(PausedAfterFirstReplace))
        )
        await Effect.runPromise(Deferred.await(reached))
        const vacation = startVacation(caretaker)
        await waitsForALock(pool, vacation)
        Deferred.doneUnsafe(release, Exit.void)
        const [cared, vacationed] = await Promise.all([care, vacation])

        const rows = await pendingRows()
        const caretakerRows = Arr.filter(rows, (r) => r.userId === caretaker)
        const ownerRows = Arr.filter(
          rows,
          (r) => r.userId === owner && r.plantId === first
        )
        if (
          Exit.isFailure(cared) ||
          Exit.isFailure(vacationed) ||
          vacationed.value === null ||
          caretakerRows.length > 0 ||
          ownerRows.length !== 1
        ) {
          failures.push(
            `round ${round}: care ${outcome(cared)}, vacation ${outcome(vacationed)}, caretaker rows ${caretakerRows.length}, owner rows on first ${ownerRows.length}`
          )
        }
      }
      expect(failures).toEqual([])
      expect((await deadlocks(pool)) - before).toBe(0)
    }, 60_000)

    it("a vacation that starts while a bulk care clears the caretaker's overdue reminder never deadlocks", async () => {
      const before = await deadlocks(pool)
      const failures: string[] = []
      for (const round of Arr.range(1, 10)) {
        const owner = await user(`OverdueOwner${round}`)
        const caretaker = await user(`OverdueCaretaker${round}`)
        const [unscheduled, scheduled] = Arr.sort(
          [await personalPlant(owner), await personalPlant(owner)],
          (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
        ) as [string, string]
        await db.execute(
          sql`DELETE FROM plant_care_schedules WHERE plant_id = ${unscheduled}`
        )
        const [delegation] = await db
          .insert(schema.careDelegations)
          .values({
            ownerId: owner,
            caretakerId: caretaker,
            status: 'active',
            startDate: new Date(Date.now() - day),
            endDate: new Date(Date.now() + 7 * day),
          })
          .returning()
        if (!delegation) throw new Error('Failed to create delegation')
        await db.insert(schema.delegationPlants).values([
          { delegationId: delegation.id, plantId: unscheduled },
          { delegationId: delegation.id, plantId: scheduled },
        ])

        const reached = Deferred.makeUnsafe<void>()
        const release = Deferred.makeUnsafe<void>()
        const OverdueLandsAfterKeys = overdueLandsAfterKeys(
          caretaker,
          unscheduled
        )
        const PausedBeforeCaretakerLock = pausedBeforeLocking(
          caretaker,
          reached,
          release
        )
        const care = as(
          owner,
          delivered(
            careMultiplePlants({
              plantIds: [unscheduled, scheduled],
              careType: 'watering',
            })
          ).pipe(
            Effect.provide(
              Layer.mergeAll(OverdueLandsAfterKeys, PausedBeforeCaretakerLock)
            )
          )
        )
        await Effect.runPromise(Deferred.await(reached))
        const vacation = startVacation(caretaker)
        await waitsForALock(pool, vacation)
        Deferred.doneUnsafe(release, Exit.void)
        const [cared, vacationed] = await Promise.all([care, vacation])

        const caretakerRows = Arr.filter(
          await pendingRows(),
          (r) => r.userId === caretaker
        )
        if (
          Exit.isFailure(cared) ||
          Exit.isFailure(vacationed) ||
          caretakerRows.length > 0
        ) {
          failures.push(
            `round ${round}: care ${outcome(cared)}, vacation ${outcome(vacationed)}, caretaker rows ${caretakerRows.length}`
          )
        }
      }
      expect(failures).toEqual([])
      expect((await deadlocks(pool)) - before).toBe(0)
    }, 60_000)

    it("a vacation that starts while a single care clears the owner's overdue reminder never deadlocks", async () => {
      const before = await deadlocks(pool)
      const failures: string[] = []
      for (const round of Arr.range(1, 10)) {
        const owner = await user(`SingleOverdueOwner${round}`)
        const plantId = await personalPlant(owner)
        const reached = Deferred.makeUnsafe<void>()
        const release = Deferred.makeUnsafe<void>()
        const care = as(
          owner,
          delivered(waterAsCurrentUser(plantId)).pipe(
            Effect.provide(
              Layer.mergeAll(
                overdueLandsAfterKeys(owner, plantId),
                pausedBeforeLocking(owner, reached, release)
              )
            )
          )
        )
        await Effect.runPromise(Deferred.await(reached))
        const vacation = startVacation(owner)
        await waitsForALock(pool, vacation)
        Deferred.doneUnsafe(release, Exit.void)
        const [cared, vacationed] = await Promise.all([care, vacation])
        const ownerRows = Arr.filter(
          await pendingRows(),
          (r) => r.userId === owner
        )
        if (
          Exit.isFailure(cared) ||
          Exit.isFailure(vacationed) ||
          ownerRows.length > 0
        ) {
          failures.push(
            `round ${round}: care ${outcome(cared)}, vacation ${outcome(vacationed)}, owner rows ${ownerRows.length}`
          )
        }
      }
      expect(failures).toEqual([])
      expect((await deadlocks(pool)) - before).toBe(0)
    }, 60_000)

    it('a vacation that starts while a single care clears an overdue reminder that was already waiting never deadlocks', async () => {
      const before = await deadlocks(pool)
      const failures: string[] = []
      for (const round of Arr.range(1, 10)) {
        const owner = await user(`WaitingOverdueOwner${round}`)
        const plantId = await personalPlant(owner)
        const reached = Deferred.makeUnsafe<void>()
        const release = Deferred.makeUnsafe<void>()
        await db.insert(schema.notifications).values({
          type: 'overdue_reminder',
          scheduledAt: new Date(),
          userId: owner,
          plantId,
          status: 'pending',
        })
        const care = as(
          owner,
          delivered(waterAsCurrentUser(plantId)).pipe(
            Effect.provide(pausedBeforeLocking(owner, reached, release))
          )
        )
        await Effect.runPromise(Deferred.await(reached))
        const vacation = startVacation(owner)
        await waitsForALock(pool, vacation)
        Deferred.doneUnsafe(release, Exit.void)
        const [cared, vacationed] = await Promise.all([care, vacation])
        const ownerRows = Arr.filter(
          await pendingRows(),
          (r) => r.userId === owner
        )
        if (
          Exit.isFailure(cared) ||
          Exit.isFailure(vacationed) ||
          ownerRows.length > 0
        ) {
          failures.push(
            `round ${round}: care ${outcome(cared)}, vacation ${outcome(vacationed)}, owner rows ${ownerRows.length}`
          )
        }
      }
      expect(failures).toEqual([])
      expect((await deadlocks(pool)) - before).toBe(0)
    }, 60_000)

    it('a bulk care that lands while a single care on the same plant waits for its replan never deadlocks', async () => {
      const before = await deadlocks(pool)
      const failures: string[] = []
      for (const round of Arr.range(1, 10)) {
        const owner = await user(`SingleBulkOwner${round}`)
        const plantId = await personalPlant(owner)
        const reached = Deferred.makeUnsafe<void>()
        const release = Deferred.makeUnsafe<void>()
        const PausedBeforeKeys = Layer.effect(
          NotificationRepository,
          Effect.map(NotificationRepository, (repo) => ({
            ...repo,
            lockReminderPlants: (plantIds) =>
              Deferred.succeed(reached, undefined).pipe(
                Effect.andThen(Deferred.await(release)),
                Effect.andThen(repo.lockReminderPlants(plantIds))
              ),
          }))
        )
        const single = as(
          owner,
          delivered(waterAsCurrentUser(plantId)).pipe(
            Effect.provide(PausedBeforeKeys)
          )
        )
        await Effect.runPromise(Deferred.await(reached))
        const bulk = as(
          owner,
          careMultiplePlants({ plantIds: [plantId], careType: 'watering' })
        )
        await waitsForALock(pool, bulk)
        Deferred.doneUnsafe(release, Exit.void)
        const [singled, bulked] = await Promise.all([single, bulk])
        const tagOf = (exit: Exit.Exit<unknown, unknown>) =>
          Exit.isFailure(exit)
            ? ((Cause.squash(exit.cause) as { _tag?: string })._tag ??
              outcome(exit))
            : 'ok'
        const tags = [tagOf(singled), tagOf(bulked)]
        if (
          Arr.some(tags, (t) => t !== 'ok' && t !== 'AlreadyCaredTodayError')
        ) {
          failures.push(`round ${round}: single ${tags[0]}, bulk ${tags[1]}`)
        }
      }
      expect(failures).toEqual([])
      expect((await deadlocks(pool)) - before).toBe(0)
    }, 60_000)

    it('a second care that arrives while the first waits for its replan writes one care log and gets AlreadyCaredTodayError', async () => {
      const failures: string[] = []
      for (const round of Arr.range(1, 5)) {
        const owner = await user(`DayLockOwner${round}`)
        const plantId = await personalPlant(owner)
        const reached = Deferred.makeUnsafe<void>()
        const release = Deferred.makeUnsafe<void>()
        const PausedBeforeKeys = Layer.effect(
          NotificationRepository,
          Effect.map(NotificationRepository, (repo) => ({
            ...repo,
            lockReminderPlants: (plantIds) =>
              Deferred.succeed(reached, undefined).pipe(
                Effect.andThen(Deferred.await(release)),
                Effect.andThen(repo.lockReminderPlants(plantIds))
              ),
          }))
        )
        const careAs = (paused: boolean) =>
          as(
            owner,
            delivered(waterAsCurrentUser(plantId)).pipe(
              paused ? Effect.provide(PausedBeforeKeys) : (e) => e
            )
          )
        const first = careAs(true)
        await Effect.runPromise(Deferred.await(reached))
        const second = careAs(false)
        await waitsForALock(pool, second)
        Deferred.doneUnsafe(release, Exit.void)
        const [a, b] = await Promise.all([first, second])
        const [logs] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.careLogs)
          .where(sql`${schema.careLogs.plantId} = ${plantId}`)
        const tags = Arr.join(
          Arr.sort(
            Arr.map([a, b], (exit) =>
              Exit.isFailure(exit)
                ? ((Cause.squash(exit.cause) as { _tag?: string })._tag ??
                  'failed')
                : 'ok'
            ),
            Order.String
          ),
          ','
        )
        if (tags !== 'AlreadyCaredTodayError,ok' || logs?.n !== 1) {
          failures.push(`round ${round}: ${tags}, logs ${logs?.n}`)
        }
      }
      expect(failures).toEqual([])
    }, 60_000)

    it("a vacation that starts while a Canopy dissolves around the member's overdue reminder never deadlocks", async () => {
      const before = await deadlocks(pool)
      const failures: string[] = []
      for (const round of Arr.range(1, 10)) {
        const owner = await user(`DissolvingOwner${round}`)
        const sharer = await user(`FirstSharer${round}`)
        const member = await user(`LeavingMember${round}`)
        const [canopy] = await db
          .insert(schema.canopies)
          .values({ name: `Dissolving ${round}`, timezone: 'UTC' })
          .returning()
        if (!canopy) throw new Error('Failed to create canopy')
        await db.insert(schema.canopyMembers).values([
          {
            canopyId: canopy.id,
            userId: owner,
            role: 'owner',
            joinedAt: new Date(Date.now() - 3 * day),
          },
          {
            canopyId: canopy.id,
            userId: sharer,
            role: 'member',
            joinedAt: new Date(Date.now() - 2 * day),
          },
          {
            canopyId: canopy.id,
            userId: member,
            role: 'member',
            joinedAt: new Date(Date.now() - day),
          },
        ])
        const sharedBy = async (userId: string) => {
          const plant = await personalPlant(userId)
          await db
            .update(schema.plants)
            .set({ canopyId: canopy.id, userId: null })
            .where(sql`${schema.plants.id} = ${plant}`)
          return plant
        }
        const sharersPlant = await sharedBy(sharer)
        await sharedBy(member)

        const reached = Deferred.makeUnsafe<void>()
        const release = Deferred.makeUnsafe<void>()
        const OverdueLandsAfterKeys = overdueLandsAfterKeys(
          member,
          sharersPlant
        )
        const PausedBeforeMemberLock = pausedBeforeLocking(
          member,
          reached,
          release
        )
        const dissolve = as(
          owner,
          delivered(deleteMyCanopy()).pipe(
            Effect.provide(
              Layer.mergeAll(OverdueLandsAfterKeys, PausedBeforeMemberLock)
            )
          )
        )
        await Effect.runPromise(Deferred.await(reached))
        const vacation = startVacation(member)
        await waitsForALock(pool, vacation)
        Deferred.doneUnsafe(release, Exit.void)
        const [dissolved, vacationed] = await Promise.all([dissolve, vacation])

        const memberRows = Arr.filter(
          await pendingRows(),
          (r) => r.userId === member
        )
        if (
          Exit.isFailure(dissolved) ||
          Exit.isFailure(vacationed) ||
          memberRows.length > 0
        ) {
          failures.push(
            `round ${round}: dissolve ${outcome(dissolved)}, vacation ${outcome(vacationed)}, member rows ${memberRows.length}`
          )
        }
      }
      expect(failures).toEqual([])
      expect((await deadlocks(pool)) - before).toBe(0)
    }, 60_000)

    it("a vacation that starts while the same user's account deletion clears an overdue reminder never deadlocks", async () => {
      const before = await deadlocks(pool)
      const failures: string[] = []
      for (const round of Arr.range(1, 10)) {
        const owner = await user(`StayingOwner${round}`)
        const leaver = await user(`DeletedMember${round}`)
        const [canopy] = await db
          .insert(schema.canopies)
          .values({ name: `Staying ${round}`, timezone: 'UTC' })
          .returning()
        if (!canopy) throw new Error('Failed to create canopy')
        await db.insert(schema.canopyMembers).values([
          { canopyId: canopy.id, userId: owner, role: 'owner' },
          { canopyId: canopy.id, userId: leaver, role: 'member' },
        ])
        const sharedPlant = await personalPlant(owner)
        await db
          .update(schema.plants)
          .set({ canopyId: canopy.id, userId: null })
          .where(sql`${schema.plants.id} = ${sharedPlant}`)

        const reached = Deferred.makeUnsafe<void>()
        const release = Deferred.makeUnsafe<void>()
        const OverdueLandsAfterKeys = overdueLandsAfterKeys(leaver, sharedPlant)
        const deletion = Deferred.succeed(reached, undefined).pipe(
          Effect.andThen(Deferred.await(release)),
          Effect.andThen(
            Effect.flatMap(UserRepository, (repo) => repo.delete(leaver))
          )
        )
        const deleted = as(
          leaver,
          leaveForDeletion(leaver)(deletion).pipe(
            Effect.provide(OverdueLandsAfterKeys)
          )
        )
        await Effect.runPromise(Deferred.await(reached))
        const vacation = startVacation(leaver)
        await waitsForALock(pool, vacation)
        Deferred.doneUnsafe(release, Exit.void)
        const [gone, vacationed] = await Promise.all([deleted, vacation])

        if (Exit.isFailure(gone) || isDeadlock(vacationed)) {
          failures.push(
            `round ${round}: deletion ${outcome(gone)}, vacation ${outcome(vacationed)}`
          )
        }
      }
      expect(failures).toEqual([])
      expect((await deadlocks(pool)) - before).toBe(0)
    }, 60_000)

    it('a vacation start removes a care reminder another transaction holds locked', async () => {
      const vacationer = await user('Vacationer')
      const plant = await personalPlant(vacationer)
      await pendingWatering(vacationer, plant)
      const locker = await pool.connect()
      try {
        await locker.query('BEGIN')
        await locker.query(
          `SELECT id FROM notifications WHERE user_id = $1 FOR UPDATE`,
          [vacationer]
        )
        const vacation = startVacation(vacationer)
        await waitsForALock(pool, vacation)
        await locker.query('ROLLBACK')
        const exit = await vacation
        expect(Exit.isSuccess(exit) && exit.value !== null).toBe(true)
      } finally {
        locker.release()
      }

      expect(
        Arr.filter(await pendingRows(), (row) => row.userId === vacationer)
      ).toEqual([])
    }, 60_000)

    const pausedAfterKeys = (
      reached: Deferred.Deferred<void>,
      release: Deferred.Deferred<void>
    ) =>
      Layer.effect(
        NotificationRepository,
        Effect.map(NotificationRepository, (repo) => ({
          ...repo,
          lockReminderPlants: (plantIds) =>
            repo
              .lockReminderPlants(plantIds)
              .pipe(
                Effect.andThen(Deferred.succeed(reached, undefined)),
                Effect.andThen(Deferred.await(release))
              ),
        }))
      )

    const pausedHoldingDelegationRow = (
      reached: Deferred.Deferred<void>,
      release: Deferred.Deferred<void>
    ) =>
      absenceOverStore((store) => ({
        ...store,
        apply: (writes) =>
          store.apply(writes).pipe(
            Effect.tap(() => Deferred.succeed(reached, undefined)),
            Effect.tap(() => Deferred.await(release))
          ),
      }))

    const pausedHoldingItsDelegations = (
      reached: Deferred.Deferred<void>,
      release: Deferred.Deferred<void>
    ) =>
      Layer.fresh(CanopyLive).pipe(
        Layer.provide(
          absenceOverStore((store) => ({
            ...store,
            holdForDeletion: (userId) =>
              store
                .holdForDeletion(userId)
                .pipe(
                  Effect.andThen(Deferred.succeed(reached, undefined)),
                  Effect.andThen(Deferred.await(release))
                ),
          }))
        )
      )

    const pausedHoldingReminderRows = (
      reached: Deferred.Deferred<void>,
      release: Deferred.Deferred<void>
    ) =>
      Layer.effect(
        NotificationRepository,
        Effect.map(NotificationRepository, (repo) => ({
          ...repo,
          lockReminders: (
            ...args: Parameters<typeof repo.lockReminders>
          ): ReturnType<typeof repo.lockReminders> =>
            repo.lockReminders(...args).pipe(
              Effect.tap(() => Deferred.succeed(reached, undefined)),
              Effect.tap(() => Deferred.await(release))
            ),
        }))
      )

    const delegated = async (
      ownerId: string,
      caretakerId: string,
      plantId: string,
      status: 'accepted' | 'active'
    ) => {
      const [delegation] = await db
        .insert(schema.careDelegations)
        .values({
          ownerId,
          caretakerId,
          status,
          startDate: new Date(
            Date.now() - (status === 'active' ? day : 60_000)
          ),
          endDate: new Date(Date.now() + 7 * day),
        })
        .returning()
      if (!delegation) throw new Error('Failed to create delegation')
      await db
        .insert(schema.delegationPlants)
        .values({ delegationId: delegation.id, plantId })
      return delegation.id
    }

    const deletionAgainstWriter: Record<
      string,
      (round: number) => Promise<{
        readonly first: readonly [
          string,
          Effect.Effect<unknown, unknown, unknown>,
        ]
        readonly second: readonly [
          string,
          Effect.Effect<unknown, unknown, unknown>,
        ]
        readonly deleting: 'first' | 'second'
        readonly pausedAt?:
          | 'delegation row'
          | 'deletion locks'
          | 'reminder rows'
      }>
    > = {
      'a caretaker deletion holding its delegation rows and the cancel of their active delegation':
        async (round) => {
          const owner = await user(`CancelingOwner${round}`)
          const caretaker = await user(`DeletedCaretaker${round}`)
          const delegation = await delegated(
            owner,
            caretaker,
            await personalPlant(owner),
            'active'
          )
          return {
            first: [caretaker, purgeAccount(caretaker)],
            second: [owner, cancelDelegation(delegation)],
            deleting: 'first',
            pausedAt: 'deletion locks',
          }
        },
      'a caretaker deletion holding its delegation rows and the tick starting their delegation':
        async (round) => {
          const owner = await user(`TickedOwner${round}`)
          const caretaker = await user(`DeletedCaretaker${round}`)
          await personalPlant(caretaker)
          await delegated(
            owner,
            caretaker,
            await personalPlant(owner),
            'accepted'
          )
          return {
            first: [caretaker, purgeAccount(caretaker)],
            second: [owner, pollAndTransition],
            deleting: 'first',
            pausedAt: 'deletion locks',
          }
        },
      'an owner deletion holding its delegation rows and the tick starting their delegation':
        async (round) => {
          const owner = await user(`DeletedOwner${round}`)
          const caretaker = await user(`TickedCaretaker${round}`)
          await delegated(
            owner,
            caretaker,
            await personalPlant(owner),
            'accepted'
          )
          return {
            first: [owner, purgeAccount(owner)],
            second: [caretaker, pollAndTransition],
            deleting: 'first',
            pausedAt: 'deletion locks',
          }
        },
      'the tick holding the row of a delegation it starts and the caretaker deletion':
        async (round) => {
          const owner = await user(`TickingOwner${round}`)
          const caretaker = await user(`DeletedCaretaker${round}`)
          await personalPlant(caretaker)
          await delegated(
            owner,
            caretaker,
            await personalPlant(owner),
            'accepted'
          )
          return {
            first: [owner, pollAndTransition],
            second: [caretaker, purgeAccount(caretaker)],
            deleting: 'second',
            pausedAt: 'delegation row',
          }
        },
      'the replan holding the plant locks of a delegation the tick started and the caretaker deletion':
        async (round) => {
          const owner = await user(`ReplannedOwner${round}`)
          const caretaker = await user(`DeletedMidReplan${round}`)
          await personalPlant(caretaker)
          await delegated(
            owner,
            caretaker,
            await personalPlant(owner),
            'accepted'
          )
          return {
            first: [owner, delivered(pollAndTransition)],
            second: [caretaker, purgeAccount(caretaker)],
            deleting: 'second',
          }
        },
      'a replan holding the waiting rows of a plant and the deletion of its owner':
        async (round) => {
          const owner = await user(`DeletedMidWrite${round}`)
          const plant = await personalPlant(owner)
          await pendingWatering(owner, plant)
          return {
            first: [owner, replanPlants([plant])],
            second: [owner, purgeAccount(owner)],
            deleting: 'second',
            pausedAt: 'reminder rows',
          }
        },
    }

    it.each(Object.entries(deletionAgainstWriter))(
      '%s never deadlock',
      async (_shape, setup) => {
        await db.execute(sql`TRUNCATE TABLE care_delegations CASCADE`)
        const before = await deadlocks(pool)
        const failures: string[] = []
        for (const round of Arr.range(1, 10)) {
          const reached = Deferred.makeUnsafe<void>()
          const release = Deferred.makeUnsafe<void>()
          const { first, second, deleting, pausedAt } = await setup(round)
          const paused = Match.value(pausedAt).pipe(
            Match.when('delegation row', () =>
              pausedHoldingDelegationRow(reached, release)
            ),
            Match.when('deletion locks', () =>
              pausedHoldingItsDelegations(reached, release)
            ),
            Match.when('reminder rows', () =>
              pausedHoldingReminderRows(reached, release)
            ),
            Match.orElse(() => pausedAfterKeys(reached, release))
          )
          const firstRun = as(first[0], Effect.provide(first[1], paused))
          await Effect.runPromise(Deferred.await(reached))
          const secondRun = as(second[0], second[1])
          await waitsForALock(pool, secondRun)
          Deferred.doneUnsafe(release, Exit.void)
          const [a, b] = await Promise.all([firstRun, secondRun])
          const [deletion, writer] = deleting === 'first' ? [a, b] : [b, a]
          if (Exit.isFailure(deletion) || isDeadlock(writer)) {
            failures.push(
              `round ${round}: deletion ${outcome(deletion)}, writer ${outcome(writer)}`
            )
          }
        }
        expect(failures).toEqual([])
        expect((await deadlocks(pool)) - before).toBe(0)
      },
      120_000
    )

    it('a replan that has to write a reminder for a plant being deleted finishes first, and the delete takes the reminder', async () => {
      const owner = await user('DeletesMidReplan')
      const plant = await personalPlant(owner)
      const reached = Deferred.makeUnsafe<void>()
      const release = Deferred.makeUnsafe<void>()

      const replanning = as(
        owner,
        Effect.provide(
          replanPlants([plant]),
          pausedHoldingReminderRows(reached, release)
        )
      )
      await Effect.runPromise(Deferred.await(reached))
      const deleting = as(owner, removeAsCurrentUser(plant))
      await waitsForALock(pool, deleting)
      Deferred.doneUnsafe(release, Exit.void)
      const [replanned, deleted] = await Promise.all([replanning, deleting])

      expect([outcome(replanned), outcome(deleted)]).toEqual(['ok', 'ok'])
      expect(Exit.isSuccess(replanned) && replanned.value).toBe(1)
      expect(
        Arr.filter(await pendingRows(), (row) => row.plantId === plant)
      ).toEqual([])
    }, 60_000)

    const crossWriters: Record<
      string,
      (round: number) => Promise<{
        readonly u: string
        readonly first: Effect.Effect<unknown, unknown, unknown>
        readonly second: () => Promise<Exit.Exit<unknown, unknown>>
      }>
    > = {
      'two timezone changes': async (round: number) => {
        const u = await user(`Tz${round}`)
        const v = await user(`OtherTz${round}`)
        const pu = await personalPlant(u)
        const pv = await personalPlant(v)
        await pendingWatering(v, pu)
        await pendingWatering(u, pv)
        return {
          u,
          first: updateUserSettings({ timezone: 'Europe/Paris' }),
          second: () => as(v, updateUserSettings({ timezone: 'Asia/Tokyo' })),
        }
      },
      'a timezone change and a vacation end': async (round: number) => {
        const u = await user(`Traveler${round}`)
        const v = await user(`Vacationer${round}`)
        await db
          .update(schema.users)
          .set({
            vacationStatus: 'active',
            vacationStart: new Date(Date.now() - 2 * day),
            vacationEnd: new Date(Date.now() + 2 * day),
          })
          .where(sql`${schema.users.id} = ${v}`)
        const pu = await personalPlant(u)
        const pv = await personalPlant(v)
        const inFlight = (userId: string, plantId: string) =>
          db.insert(schema.notifications).values({
            type: 'watering_reminder',
            scheduledAt: new Date(Date.now() + day),
            userId,
            plantId,
            status: 'queued',
            queuedAt: new Date(),
            deliveryMessageId: `in-flight-${userId}`,
          })
        await inFlight(v, pu)
        await inFlight(u, pv)
        return {
          u,
          first: updateUserSettings({ timezone: 'Europe/Paris' }),
          second: () => as(v, returnFromVacation(v)),
        }
      },
      'a vacation end and a timezone change': async (round: number) => {
        const [v, u] = Arr.sort(
          [await user(`Returning${round}`), await user(`Mover${round}`)],
          (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
        ) as [string, string]
        await db
          .update(schema.users)
          .set({
            vacationStatus: 'active',
            vacationStart: new Date(Date.now() - 2 * day),
            vacationEnd: new Date(Date.now() + 2 * day),
          })
          .where(sql`${schema.users.id} = ${v}`)
        const pu = await personalPlant(u)
        const pv = await personalPlant(v)
        await pendingWatering(v, pu)
        await pendingWatering(u, pv)
        return {
          u: v,
          first: returnFromVacation(v),
          second: () => as(u, updateUserSettings({ timezone: 'Asia/Tokyo' })),
        }
      },
    }

    it.each(Object.entries(crossWriters))(
      "%s by two users who each hold a reminder on the other's plant never deadlock",
      async (_shape, setup) => {
        const before = await deadlocks(pool)
        const failures: string[] = []
        for (const round of Arr.range(1, 10)) {
          const reached = Deferred.makeUnsafe<void>()
          const release = Deferred.makeUnsafe<void>()
          const { u, first, second } = await setup(round)
          const firstRun = as(
            u,
            delivered(first).pipe(
              Effect.provide(pausedAfterKeys(reached, release))
            )
          )
          await Effect.runPromise(Deferred.await(reached))
          const secondRun = second()
          await waitsForALock(pool, secondRun)
          Deferred.doneUnsafe(release, Exit.void)
          const [a, b]: readonly [
            Exit.Exit<unknown, unknown>,
            Exit.Exit<unknown, unknown>,
          ] = await Promise.all([firstRun, secondRun])
          if (Exit.isFailure(a) || Exit.isFailure(b)) {
            failures.push(`round ${round}: ${outcome(a)}, ${outcome(b)}`)
          }
        }
        expect(failures).toEqual([])
        expect((await deadlocks(pool)) - before).toBe(0)
      },
      120_000
    )

    it('a vacation end that holds the account while a bulk care holds the plants it will move never deadlocks', async () => {
      const before = await deadlocks(pool)
      const failures: string[] = []
      for (const round of Arr.range(1, 5)) {
        const away = await user(`Away${round}`)
        await db
          .update(schema.users)
          .set({
            vacationStatus: 'active',
            vacationStart: new Date(Date.now() - 2 * day),
            vacationEnd: new Date(Date.now() + 2 * day),
          })
          .where(sql`${schema.users.id} = ${away}`)
        const own = [
          await personalPlant(away),
          await personalPlant(away),
          await personalPlant(away),
        ]
        const reached = Deferred.makeUnsafe<void>()
        const release = Deferred.makeUnsafe<void>()
        const ending = as(
          away,
          Effect.provide(
            returnFromVacation(away),
            absenceOverStore((store) => ({
              ...store,
              lockVacation: (userId, now) =>
                store.lockVacation(userId, now).pipe(
                  Effect.tap(() => Deferred.succeed(reached, undefined)),
                  Effect.tap(() => Deferred.await(release))
                ),
            }))
          )
        )
        await Effect.runPromise(Deferred.await(reached))
        const caring = as(
          away,
          careMultiplePlants({
            plantIds: shuffled(own, round),
            careType: 'watering',
          })
        )
        await waitsForALock(pool, caring)
        Deferred.doneUnsafe(release, Exit.void)
        const [ended, cared]: readonly [
          Exit.Exit<unknown, unknown>,
          Exit.Exit<unknown, unknown>,
        ] = await Promise.all([ending, caring])
        if (Exit.isFailure(ended) || Exit.isFailure(cared)) {
          failures.push(`round ${round}: ${outcome(ended)}, ${outcome(cared)}`)
        }
      }
      expect(failures).toEqual([])
      expect((await deadlocks(pool)) - before).toBe(0)
    }, 120_000)

    describe('overdue reminders for a caretaker', () => {
      let delegated: string[]

      beforeAll(async () => {
        delegated = []
        for (const i of Arr.range(1, 3)) {
          const [row] = await db
            .insert(schema.plants)
            .values({
              userId: alex,
              createdByUserId: alex,
              name: `Delegated ${i}`,
              health: 'HEALTHY',
              humidityRating: 3,
              lightingRating: 3,
              petToxicityRating: 1,
              wateringRating: 3,
            })
            .returning()
          if (!row) throw new Error('Failed to create plant')
          delegated.push(row.id)
          const dueAt = new Date()
          await db.insert(schema.plantCareSchedules).values({
            plantId: row.id,
            careType: 'watering',
            frequencyDays: 7,
            nextCareAt: dueAt,
            dueDay: careDayOf(dueAt),
          })
        }
        const [delegation] = await db
          .insert(schema.careDelegations)
          .values({
            ownerId: alex,
            caretakerId: sam,
            status: 'active',
            startDate: new Date(Date.now() - 5 * day),
            endDate: new Date(Date.now() + 7 * day),
          })
          .returning()
        if (!delegation) throw new Error('Failed to create delegation')
        await db.insert(schema.delegationPlants).values(
          Arr.map(delegated, (plantId) => ({
            delegationId: delegation.id,
            plantId,
          }))
        )
      })

      beforeEach(async () => {
        await db.execute(
          sql`UPDATE plant_care_schedules SET next_care_at = now() - interval '3 days', due_day = ((now() - interval '3 days') AT TIME ZONE 'UTC')::date WHERE plant_id IN (${sql.join(
            Arr.map(delegated, (p) => sql`${p}`),
            sql`, `
          )})`
        )
      })

      const overdueRows = () =>
        db
          .select({
            userId: schema.notifications.userId,
            plantId: schema.notifications.plantId,
            scheduledAt: schema.notifications.scheduledAt,
          })
          .from(schema.notifications)
          .where(sql`${schema.notifications.type} = 'overdue_reminder'`)

      const plantIdsOf = async (userId: string) =>
        Arr.sort(
          Arr.flatMap(await overdueRows(), (r) =>
            r.userId === userId && r.plantId !== null ? [r.plantId] : []
          ),
          Order.String
        )

      const runOverdue = (careLands: () => Promise<unknown> = async () => {}) =>
        as(
          sam,
          checkAndCreateOverdueReminders.pipe(
            Effect.provide(
              Layer.effect(
                CareScheduleRepository,
                Effect.map(CareScheduleRepository, (repo) => ({
                  ...repo,
                  findReminderAudience: (plantIds: ReadonlyArray<string>) =>
                    Effect.tap(repo.findReminderAudience(plantIds), () =>
                      Effect.promise(careLands)
                    ),
                }))
              )
            )
          )
        )

      it('writes the caretaker one row per delegated plant per day and the owner none', async () => {
        await runOverdue()
        await runOverdue()

        expect(await plantIdsOf(sam)).toEqual(Arr.sort(delegated, Order.String))
        expect(await plantIdsOf(alex)).toEqual([])
        const times = new Set(
          Arr.map(await overdueRows(), (r) => r.scheduledAt?.getTime())
        )
        expect(times.size).toBe(1)
      }, 60_000)

      it('writes one row per plant when two passes decide at once', async () => {
        const together = () => {
          let arrived = 0
          const both = Deferred.makeUnsafe<void>()
          return Effect.suspend(() => {
            arrived += 1
            return arrived === 2
              ? Deferred.succeed(both, undefined)
              : Effect.race(
                  Deferred.await(both),
                  Effect.asVoid(
                    Effect.promise((signal) =>
                      sessionsWaitingForALock(pool, 1, signal)
                    )
                  )
                )
          })
        }
        const scanned = together()
        const checked = together()
        const InStep = Layer.mergeAll(
          Layer.effect(
            CareScheduleRepository,
            Effect.map(CareScheduleRepository, (repo) => ({
              ...repo,
              findReminderAudience: (plantIds: ReadonlyArray<string>) =>
                Effect.tap(repo.findReminderAudience(plantIds), () => scanned),
            }))
          ),
          Layer.effect(
            NotificationRepository,
            Effect.map(NotificationRepository, (repo) => ({
              ...repo,
              hasOverdueReminderOn: (
                query: Parameters<typeof repo.hasOverdueReminderOn>[0]
              ) => Effect.tap(repo.hasOverdueReminderOn(query), () => checked),
            }))
          )
        )
        const pass = () =>
          as(sam, checkAndCreateOverdueReminders.pipe(Effect.provide(InStep)))

        const exits = await Promise.all([pass(), pass()])

        expect(Arr.map(exits, Exit.isSuccess)).toEqual([true, true])
        expect(await plantIdsOf(sam)).toEqual(Arr.sort(delegated, Order.String))
      }, 60_000)

      it('records the day of the recipient, not of the plant, on each row', async () => {
        const zone = aZoneOnAnotherDayThanUtc()
        await db.execute(
          sql`UPDATE users SET timezone = ${zone} WHERE id = ${sam}`
        )
        try {
          await runOverdue()
          const { rows } = await db.execute<{ day: string }>(
            sql`SELECT DISTINCT occasion_day::text AS day FROM notifications WHERE type = 'overdue_reminder' AND user_id = ${sam}`
          )
          const local = new Intl.DateTimeFormat('en-CA', {
            timeZone: zone,
          }).format(new Date())
          expect(rows).toEqual([{ day: local }])
        } finally {
          await db.execute(
            sql`UPDATE users SET timezone = 'UTC' WHERE id = ${sam}`
          )
        }
      }, 60_000)

      it('counts a reminder written today before rows recorded their day', async () => {
        const [first] = delegated as [string, ...string[]]
        await db.insert(schema.notifications).values({
          type: 'overdue_reminder',
          scheduledAt: new Date(),
          sentAt: new Date(),
          createdAt: new Date(),
          userId: sam,
          plantId: first,
          status: 'sent',
        })

        await runOverdue()

        expect(await plantIdsOf(sam)).toEqual([first])
      }, 60_000)

      it('leaves no overdue row for a plant cared for while the run is in flight', async () => {
        const [cared, ...rest] = delegated as [string, ...string[]]

        let careExit: Exit.Exit<unknown, unknown> | undefined
        const exit = await runOverdue(async () => {
          careExit = await as(alex, waterAsCurrentUser(cared, new Date()))
        })

        expect(careExit && Exit.isSuccess(careExit)).toBe(true)
        expect(Exit.isSuccess(exit)).toBe(true)
        expect(await plantIdsOf(sam)).toEqual(Arr.sort(rest, Order.String))
      }, 60_000)

      it('writes none of a caretaker rows when one insert fails, and all of them on the next run', async () => {
        await db.execute(sql`
          CREATE OR REPLACE FUNCTION fail_third_overdue() RETURNS trigger AS $$
          BEGIN
            IF NEW.type = 'overdue_reminder' AND (SELECT count(*) FROM notifications WHERE type = 'overdue_reminder') >= 2 THEN
              RAISE EXCEPTION 'injected overdue insert failure';
            END IF;
            RETURN NEW;
          END $$ LANGUAGE plpgsql`)
        await db.execute(
          sql`CREATE TRIGGER fail_third_overdue BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION fail_third_overdue()`
        )
        try {
          await runOverdue()
          expect(await plantIdsOf(sam)).toEqual([])
        } finally {
          await db.execute(
            sql`DROP TRIGGER IF EXISTS fail_third_overdue ON notifications`
          )
          await db.execute(sql`DROP FUNCTION IF EXISTS fail_third_overdue()`)
        }

        await runOverdue()
        expect(await plantIdsOf(sam)).toEqual(Arr.sort(delegated, Order.String))
      }, 60_000)

      it('reminds the other recipients when the rows of one fail', async () => {
        const ivy = await user('Ivy')
        const [own] = await db
          .insert(schema.plants)
          .values({
            userId: ivy,
            createdByUserId: ivy,
            name: 'Own',
            health: 'HEALTHY',
            humidityRating: 3,
            lightingRating: 3,
            petToxicityRating: 1,
            wateringRating: 3,
          })
          .returning()
        if (!own) throw new Error('Failed to create plant')
        const dueAt = new Date(Date.now() - 3 * day)
        await db.insert(schema.plantCareSchedules).values({
          plantId: own.id,
          careType: 'watering',
          frequencyDays: 7,
          nextCareAt: dueAt,
          dueDay: careDayOf(dueAt),
        })
        await db.execute(sql`
          CREATE OR REPLACE FUNCTION fail_overdue_of_sam() RETURNS trigger AS $$
          BEGIN RAISE EXCEPTION 'injected overdue insert failure'; END
          $$ LANGUAGE plpgsql`)
        await db.execute(
          sql.raw(
            `CREATE TRIGGER fail_overdue_of_sam BEFORE INSERT ON notifications FOR EACH ROW WHEN (NEW.type = 'overdue_reminder' AND NEW.user_id = '${sam}') EXECUTE FUNCTION fail_overdue_of_sam()`
          )
        )
        try {
          const exit = await runOverdue()

          expect(Exit.isSuccess(exit)).toBe(true)
          expect(await plantIdsOf(sam)).toEqual([])
          expect(await plantIdsOf(ivy)).toEqual([own.id])
        } finally {
          await db.execute(
            sql`DROP TRIGGER IF EXISTS fail_overdue_of_sam ON notifications`
          )
          await db.execute(sql`DROP FUNCTION IF EXISTS fail_overdue_of_sam()`)
          await db.execute(sql`DELETE FROM plants WHERE id = ${own.id}`)
        }
      }, 60_000)

      it('leaves no overdue row for a plant cared for while the run holds its reminder lock', async () => {
        const [cared, ...rest] = delegated as [string, ...string[]]

        let care: Promise<Exit.Exit<unknown, unknown>> | undefined
        const exit = await as(
          sam,
          checkAndCreateOverdueReminders.pipe(
            Effect.provide(
              Layer.effect(
                CareReads,
                Effect.map(CareReads, (reads) => ({
                  due: (query: DueQuery) =>
                    Effect.tap(reads.due(query), () =>
                      Effect.promise(async () => {
                        if (query.scope._tag !== 'Plants') return
                        care = as(alex, waterAsCurrentUser(cared, new Date()))
                        await waitsForALock(pool, care)
                      })
                    ),
                }))
              )
            )
          )
        )
        const careExit = await care

        expect(careExit && Exit.isSuccess(careExit)).toBe(true)
        expect(Exit.isSuccess(exit)).toBe(true)
        expect(await plantIdsOf(sam)).toEqual(Arr.sort(rest, Order.String))
      }, 60_000)

      it('gives a plant with reminders off no row and no free-tier cap slot', async () => {
        const fern = await user('Fern')
        const own: string[] = []
        for (const i of Arr.range(0, 5)) {
          const [row] = await db
            .insert(schema.plants)
            .values({
              userId: fern,
              createdByUserId: fern,
              name: `Own ${i}`,
              health: 'HEALTHY',
              humidityRating: 3,
              lightingRating: 3,
              petToxicityRating: 1,
              wateringRating: 3,
              remindersEnabled: i !== 0,
              dateAdded: new Date(Date.now() - (100 - i) * day),
            })
            .returning()
          if (!row) throw new Error('Failed to create plant')
          own.push(row.id)
          const dueAt = new Date(Date.now() - 3 * day)
          await db.insert(schema.plantCareSchedules).values({
            plantId: row.id,
            careType: 'watering',
            frequencyDays: 7,
            nextCareAt: dueAt,
            dueDay: careDayOf(dueAt),
          })
        }

        await runOverdue()

        expect(await plantIdsOf(fern)).toEqual(
          Arr.sort(own.slice(1), Order.String)
        )
        const nudges = await db
          .select({ id: schema.notifications.id })
          .from(schema.notifications)
          .where(
            sql`${schema.notifications.type} = 'resubscribe_nudge' AND ${schema.notifications.userId} = ${fern}`
          )
        expect(nudges).toEqual([])
      }, 60_000)

      it('reminds the owner, not the former caretaker, once the delegation has ended', async () => {
        await db.execute(
          sql`UPDATE care_delegations SET status = 'completed' WHERE caretaker_id = ${sam}`
        )
        try {
          await runOverdue()
          expect(await plantIdsOf(sam)).toEqual([])
          expect(await plantIdsOf(alex)).toEqual(
            Arr.sort(delegated, Order.String)
          )
        } finally {
          await db.execute(
            sql`UPDATE care_delegations SET status = 'active' WHERE caretaker_id = ${sam}`
          )
        }
      }, 60_000)
    })
  }
)
