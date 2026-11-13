import {
  delivered,
  drainOutbox,
  waterAsCurrentUser,
} from '@lily/api/__tests__/integration/care-layers'
import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockRateLimiterService } from '@lily/api/__tests__/mocks/rate-limiter.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import { Care, CareReadsLive, frequencyOfDays } from '@lily/api/contexts/care'
import { replanPlants } from '@lily/api/contexts/reminders'
import type { Outbox } from '@lily/api/kernel/outbox'
import { Actor, mintPermit } from '@lily/api/kernel/permit'
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
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import { RefreshTokenRepositoryLive } from '@lily/api/repositories/refresh-token.repository'
import { RoomRepositoryLive } from '@lily/api/repositories/room.repository'
import { SubscriptionRepositoryLive } from '@lily/api/repositories/subscription.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { updateMyCanopy } from '@lily/api/services/canopy/endpoints/update-my-canopy'
import { joinCanopy } from '@lily/api/services/canopy/helpers/join-canopy'
import { leaveCanopy } from '@lily/api/services/canopy/helpers/leave-canopy'
import { completeDelegation } from '@lily/api/services/delegation/endpoints/complete-delegation'
import { pollAndTransition } from '@lily/api/services/delegation-scheduler/scheduler'
import { checkAndCreateOverdueReminders } from '@lily/api/services/overdue-scheduler/scheduler'
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
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import {
  Array,
  Cause,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Option,
  References,
} from 'effect'
import { SqlError } from 'effect/sql/SqlError'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

const DAY_MS = 86_400_000

const ReposLive = Layer.mergeAll(
  ActivityPushTokenRepositoryLive,
  CareReadsLive,
  CanopyRepositoryLive,
  CareLogRepositoryLive,
  CarePlanRepositoryLive,
  CareScheduleRepositoryLive,
  DelegationRepositoryLive,
  DeviceTokenRepositoryLive,
  NotificationRepositoryLive,
  PlantRepositoryLive,
  RefreshTokenRepositoryLive,
  RoomRepositoryLive,
  SubscriptionRepositoryLive,
  UserRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const mocksAs = (userId: string) =>
  Layer.mergeAll(
    createMockCurrentUser({ id: userId }),
    createMockEventBus(),
    createMockLimitChecker(),
    createMockMessageQueue(),
    createMockRateLimiterService(),
    createMockWeatherProvider(),
    createMockWeatherCache(),
    createMockWeatherRepository(),
    MockAlerterLive
  )

type Repos = Layer.Success<typeof ReposLive>
type App = Repos | Layer.Success<ReturnType<typeof mocksAs>> | Outbox | Care

type UserRow = typeof schema.users.$inferSelect

interface World {
  readonly alex: string
  readonly aboutToLeave: UserRow
  readonly onVacation: UserRow
  readonly sam: string
  readonly june: string
  readonly canopyId: string
  readonly sharedPlant: string
  readonly mutedPlant: string
  readonly overduePlant: string
  readonly deadPlant: string
  readonly ownPlant: string
  readonly plantToHandOver: string
  readonly tendedPlant: string
  readonly tendedDelegation: string
  readonly plants: ReadonlyArray<string>
}

type Act = readonly [
  actor: string,
  effect: Effect.Effect<unknown, unknown, App>,
]

const on = <A, E>(
  plantId: string,
  act: (plant: PlantWithRoom) => Effect.Effect<A, E, App>
) =>
  Effect.flatMap(PlantRepository, (repo) => repo.findById(plantId)).pipe(
    Effect.flatMap((found) =>
      found === null ? Effect.die(`no plant ${plantId}`) : act(found)
    )
  )

const TRIGGERS: ReadonlyArray<
  readonly [name: string, act: (world: World) => Act]
> = [
  ['care recorded', (w) => [w.alex, waterAsCurrentUser(w.sharedPlant)]],
  [
    'schedule changed',
    (w) => [
      w.alex,
      Effect.flatMap(Care, (care) =>
        care.setSchedules({
          permit: mintPermit(
            w.sharedPlant,
            'edit',
            Actor.User({ userId: w.alex })
          ),
          frequencies: [['watering', Option.some(frequencyOfDays(3))]],
        })
      ),
    ],
  ],
  [
    'bury',
    (w) => [
      w.alex,
      on(w.sharedPlant, (p) => markPlantDead(p, { cause: 'unknown' })),
    ],
  ],
  ['revive', (w) => [w.alex, on(w.deadPlant, revivePlant)]],
  ['mute', (w) => [w.aboutToLeave.id, on(w.sharedPlant, mutePlant)]],
  ['unmute', (w) => [w.alex, on(w.mutedPlant, unmutePlant)]],
  [
    'share',
    (w) => [w.alex, on(w.ownPlant, (p) => sharePlantWithCanopy(p, {}))],
  ],
  ['unshare', (w) => [w.alex, on(w.sharedPlant, (p) => unsharePlant(p, {}))]],
  [
    'canopy timezone',
    (w) => [w.alex, updateMyCanopy({ timezone: 'Pacific/Niue' })],
  ],
  ['leave', (w) => [w.aboutToLeave.id, leaveCanopy(w.aboutToLeave.id)]],
  [
    'join',
    (w) => {
      const invited = Effect.succeed({ canopyId: w.canopyId })
      return [
        w.june,
        joinCanopy(
          { id: w.june, name: 'June' },
          {
            findBeforeLock: invited,
            findUnderLock: invited,
            markUsed: Effect.void,
          }
        ),
      ]
    },
  ],
  ['delegation start', (w) => [w.alex, pollAndTransition]],
  ['delegation end', (w) => [w.alex, completeDelegation(w.tendedDelegation)]],
  [
    'vacation start',
    (w) => [w.aboutToLeave.id, activateVacation({ expected: w.aboutToLeave })],
  ],
  [
    'vacation end',
    (w) => [
      w.onVacation.id,
      endVacation({ user: w.onVacation, effectiveEnd: new Date() }),
    ],
  ],
  [
    'settings change',
    (w) => [w.alex, updateUserSettings({ preferredNotificationTime: '14:00' })],
  ],
  ['account deletion', (w) => [w.aboutToLeave.id, deleteAccount()]],
  ['account purge', (w) => [w.alex, purgeAccount(w.sam)]],
  ['overdue pass', (w) => [w.alex, checkAndCreateOverdueReminders]],
  ['a replan', (w) => [w.alex, replanPlants(w.plants)]],
  ['plant deleted', (w) => [w.alex, on(w.sharedPlant, deletePlant)]],
]

const tableOf = (failure: unknown) =>
  typeof failure === 'object' && failure !== null && 'table' in failure
    ? String(failure.table)
    : 'no table'

const surfaced = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.match(exit, {
    onSuccess: () => Option.none<string>(),
    onFailure: (cause) => {
      const error = Cause.squash(cause)
      if (!(error instanceof SqlError)) return Option.none<string>()
      const table = tableOf(error.reason.cause)
      return error.reason._tag === 'DeadlockError' || table === 'notifications'
        ? Option.some(`${error.reason._tag} on ${table}`)
        : Option.none<string>()
    },
  })

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'What makes reminders stale, two at a time - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let runtime: ManagedRuntime.ManagedRuntime<
      Repos,
      Layer.Error<typeof ReposLive>
    >
    let deadlocksBefore: number

    const run = <A, E>(userId: string, effect: Effect.Effect<A, E, App>) =>
      runtime.runPromiseExit(
        effect.pipe(
          delivered,
          Effect.provide(mocksAs(userId)),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

    const deadlocks = async () => {
      // The counter is flushed at most once a second.
      await new Promise((resolve) => setTimeout(resolve, 1200))
      const { rows } = await db.execute<{ deadlocks: string }>(
        sql`SELECT deadlocks::text AS deadlocks FROM pg_stat_database WHERE datname = current_database()`
      )
      return Number(rows[0]?.deadlocks ?? 0)
    }

    const world = async (): Promise<World> => {
      await db.execute(
        sql.raw(
          'TRUNCATE TABLE outbox, dead_letter_messages, notifications, care_delegations, plant_care_schedules, plants, canopy_plant_mutes, canopy_members, canopies, users RESTART IDENTITY CASCADE'
        )
      )
      const away = {
        vacationStart: new Date(Date.now() - DAY_MS),
        vacationEnd: new Date(Date.now() + 7 * DAY_MS),
      }
      const [alex, aboutToLeave, onVacation, sam, june] = await db
        .insert(schema.users)
        .values(
          Array.map(
            [
              { name: 'Alex' },
              { name: 'Lily', vacationStatus: 'scheduled' as const, ...away },
              { name: 'Noor', vacationStatus: 'active' as const, ...away },
              { name: 'Sam' },
              { name: 'June' },
            ],
            (user) => ({
              email: `${user.name.toLowerCase()}@example.com`,
              emailVerified: true,
              role: 'user' as const,
              status: 'active' as const,
              timezone: 'UTC',
              careReminders: true,
              preferredNotificationTime: '09:00',
              ...user,
            })
          )
        )
        .returning()
      const [canopy] = await db
        .insert(schema.canopies)
        .values({ name: 'Flat', timezone: 'UTC' })
        .returning()
      if (!alex || !aboutToLeave || !onVacation || !sam || !june || !canopy) {
        throw new Error('Failed to seed the household')
      }
      await db.insert(schema.canopyMembers).values([
        { canopyId: canopy.id, userId: alex.id, role: 'owner' },
        { canopyId: canopy.id, userId: aboutToLeave.id, role: 'member' },
        { canopyId: canopy.id, userId: onVacation.id, role: 'member' },
      ])
      const shared = { canopyId: canopy.id, createdByUserId: alex.id }
      const own = { userId: alex.id, createdByUserId: alex.id }
      const seeded = await db
        .insert(schema.plants)
        .values(
          Array.map(
            [
              { name: 'sharedPlant', ...shared },
              {
                name: 'mutedPlant',
                ...shared,
                createdByUserId: aboutToLeave.id,
              },
              { name: 'overduePlant', ...shared },
              { name: 'deadPlant', ...shared, diedAt: new Date() },
              { name: 'ownPlant', ...own },
              { name: 'plantToHandOver', ...own },
              { name: 'tendedPlant', ...own },
            ],
            (plant) => ({
              health: 'HEALTHY' as const,
              humidityRating: 3,
              lightingRating: 3,
              petToxicityRating: 1,
              wateringRating: 3,
              ...plant,
            })
          )
        )
        .returning()
      const [
        sharedPlant,
        mutedPlant,
        overduePlant,
        deadPlant,
        ownPlant,
        plantToHandOver,
        tendedPlant,
      ] = Array.map(seeded, (plant) => plant.id)
      if (
        !sharedPlant ||
        !mutedPlant ||
        !overduePlant ||
        !deadPlant ||
        !ownPlant ||
        !plantToHandOver ||
        !tendedPlant
      ) {
        throw new Error('Failed to seed the plants')
      }
      const plants = [
        sharedPlant,
        mutedPlant,
        overduePlant,
        deadPlant,
        ownPlant,
        plantToHandOver,
        tendedPlant,
      ]
      await db.insert(schema.plantCareSchedules).values(
        Array.map(plants, (plantId) => ({
          plantId,
          careType: 'watering' as const,
          frequencyDays: 7,
          nextCareAt: new Date(
            Date.now() + (plantId === overduePlant ? -2 : 3) * DAY_MS
          ),
        }))
      )
      await db
        .insert(schema.canopyPlantMutes)
        .values({ userId: alex.id, plantId: mutedPlant })
      const [starting, tendedDelegation] = await db
        .insert(schema.careDelegations)
        .values(
          Array.map(['accepted', 'active'] as const, (status) => ({
            ownerId: alex.id,
            caretakerId: sam.id,
            status,
            startDate: new Date(Date.now() - DAY_MS),
            endDate: new Date(Date.now() + 7 * DAY_MS),
          }))
        )
        .returning()
      if (!starting || !tendedDelegation)
        throw new Error('Failed to seed delegations')
      await db.insert(schema.delegationPlants).values([
        { delegationId: starting.id, plantId: plantToHandOver },
        { delegationId: tendedDelegation.id, plantId: tendedPlant },
      ])
      const seededWorld = {
        alex: alex.id,
        aboutToLeave,
        onVacation,
        sam: sam.id,
        june: june.id,
        canopyId: canopy.id,
        sharedPlant,
        mutedPlant,
        overduePlant,
        deadPlant,
        ownPlant,
        plantToHandOver,
        tendedPlant,
        tendedDelegation: tendedDelegation.id,
        plants,
      }
      await run(alex.id, replanPlants(plants))
      return seededWorld
    }

    const settle: Effect.Effect<void, SqlError, Outbox> = Effect.flatMap(
      drainOutbox,
      (deliveries) => (deliveries === 0 ? Effect.void : settle)
    )

    const wrongAfter = async (
      w: World,
      exits: ReadonlyArray<readonly [string, Exit.Exit<unknown, unknown>]>
    ) => {
      await run(w.alex, settle)
      const undelivered = await db.execute<{ last_error: string | null }>(
        sql`SELECT last_error FROM outbox WHERE processed_at IS NULL OR last_error IS NOT NULL`
      )
      const doubled = await db.execute(
        sql`SELECT 1 FROM notifications WHERE status = 'pending' AND plant_id IS NOT NULL GROUP BY user_id, plant_id, type HAVING count(*) > 1`
      )
      const drift = await run(w.alex, replanPlants(w.plants))
      return [
        ...Array.flatMap(exits, ([name, exit]) =>
          Option.match(surfaced(exit), {
            onNone: () => [],
            onSome: (error) => [`${name} failed with ${error}`],
          })
        ),
        ...Array.map(
          undelivered.rows,
          (row) => `undelivered: ${row.last_error?.slice(0, 200) ?? 'waiting'}`
        ),
        ...(doubled.rows.length > 0
          ? [`${doubled.rows.length} reminders are doubled`]
          : []),
        ...(Exit.isSuccess(drift) && drift.value === 0
          ? []
          : [
              `a full replan still had to change something: ${
                Exit.isSuccess(drift) ? drift.value : Cause.pretty(drift.cause)
              }`,
            ]),
      ]
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      runtime = ManagedRuntime.make(ReposLive)
      deadlocksBefore = await deadlocks()
    })

    afterAll(async () => {
      await runtime.dispose()
      await pool.end()
    })

    it('every trigger succeeds on its own and leaves reminders the rule agrees with', async () => {
      const problems: string[] = []
      for (const [name, act] of TRIGGERS) {
        const w = await world()
        const [actor, effect] = act(w)
        const exit = await run(actor, effect)
        const wrong = [
          ...(Exit.isSuccess(exit)
            ? []
            : [`failed: ${Cause.pretty(exit.cause)}`]),
          ...(await wrongAfter(w, [[name, exit]])),
        ]
        problems.push(...Array.map(wrong, (problem) => `${name}: ${problem}`))
      }

      expect(problems).toEqual([])
    }, 120_000)

    it.each(TRIGGERS)(
      '%s, racing every trigger, leaves no error, no doubled reminder and nothing to replan',
      async (first, actFirst) => {
        const problems: string[] = []
        for (const [second, actSecond] of TRIGGERS) {
          const w = await world()
          const [firstActor, firstEffect] = actFirst(w)
          const [secondActor, secondEffect] = actSecond(w)
          const [firstExit, secondExit] = await Promise.all([
            run(firstActor, firstEffect),
            run(secondActor, secondEffect),
          ])
          const wrong = await wrongAfter(w, [
            [first, firstExit],
            [second, secondExit],
          ])
          problems.push(
            ...Array.map(wrong, (problem) => `with ${second}: ${problem}`)
          )
        }

        expect(problems).toEqual([])
      },
      120_000
    )

    it('Postgres counted no deadlock over the whole table', async () => {
      expect((await deadlocks()) - deadlocksBefore).toBe(0)
    })
  }
)
