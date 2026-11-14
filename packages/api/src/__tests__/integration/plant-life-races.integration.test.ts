import { delivered } from '@lily/api/__tests__/integration/canopy-layers'
import {
  buryAsCurrentUser,
  removeAsCurrentUser,
  reviveAsCurrentUser,
  waterAsCurrentUser,
} from '@lily/api/__tests__/integration/care-layers'
import {
  deadlocks,
  statementsWaitingForALock,
} from '@lily/api/__tests__/integration/lock-waits'
import { chatPermit } from '@lily/api/__tests__/mocks/care'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockRagService } from '@lily/api/__tests__/mocks/rag.service'
import { createMockRateLimiterService } from '@lily/api/__tests__/mocks/rate-limiter.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import type { Absence } from '@lily/api/contexts/absence'
import type { Canopy } from '@lily/api/contexts/canopy'
import {
  type Care,
  type CarePlans,
  CareReadsLive,
  type PlantLife,
} from '@lily/api/contexts/care'
import type { Outbox } from '@lily/api/kernel/outbox'
import { AchievementRepositoryLive } from '@lily/api/repositories/achievement.repository'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CarePlanRepositoryLive } from '@lily/api/repositories/care-plan.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { DeviceTokenRepositoryLive } from '@lily/api/repositories/device-token.repository'
import { DiagnosisRepositoryLive } from '@lily/api/repositories/diagnosis.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { RefreshTokenRepositoryLive } from '@lily/api/repositories/refresh-token.repository'
import { RoomRepositoryLive } from '@lily/api/repositories/room.repository'
import { SubscriptionRepositoryLive } from '@lily/api/repositories/subscription.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import type { ToolContext } from '@lily/api/services/ai-chat/tools'
import { createDiagnosisTool } from '@lily/api/services/ai-chat/tools/create-diagnosis'
import { completeCarePlanStep } from '@lily/api/services/care-plans/endpoints/complete-care-plan-step'
import { withCarePlanStep } from '@lily/api/services/care-plans/helpers/with-care-plan-auth'
import { createPlant } from '@lily/api/services/plants/endpoints/create-plant'
import { LimitCheckerLive } from '@lily/api/services/subscriptions/limit-checker'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { and, count, eq, isNull, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, Cause, Effect, Exit, Layer, Option, References } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const ROUNDS = 20

const RepositoriesLive = Layer.mergeAll(
  AchievementRepositoryLive,
  CanopyRepositoryLive,
  CareLogRepositoryLive,
  CarePlanRepositoryLive,
  CareScheduleRepositoryLive,
  CareReadsLive,
  DelegationRepositoryLive,
  DeviceTokenRepositoryLive,
  DiagnosisRepositoryLive,
  NotificationRepositoryLive,
  PlantRepositoryLive,
  RefreshTokenRepositoryLive,
  RoomRepositoryLive,
  SubscriptionRepositoryLive,
  UserRepositoryLive,
  createMockMessageQueue(),
  createMockRagService()
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const appAs = (userId: string) =>
  Layer.mergeAll(
    LimitCheckerLive,
    createMockCurrentUser({ id: userId }),
    createMockEventBus(),
    createMockRateLimiterService(),
    createMockWeatherProvider(),
    createMockWeatherCache(),
    createMockWeatherRepository()
  ).pipe(Layer.provideMerge(RepositoriesLive))

type App =
  | Layer.Success<ReturnType<typeof appAs>>
  | Outbox
  | Care
  | CarePlans
  | PlantLife
  | Canopy
  | Absence

const NOTHING_OF_THE_PLANT = {
  plants: 0,
  schedules: 0,
  cares: 0,
  plans: 0,
  diagnoses: 0,
  notifications: 0,
}

const how = (exit: Exit.Exit<unknown, unknown>): string =>
  Exit.match(exit, {
    onSuccess: () => 'ran',
    onFailure: (cause) =>
      Option.match(Cause.findErrorOption(cause), {
        onSome: (error) =>
          typeof error === 'object' && error !== null && '_tag' in error
            ? String(error._tag)
            : `failed: ${String(error)}`,
        onNone: () => `defect: ${Cause.pretty(cause)}`,
      }),
  })

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Plant life races - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let alex: string

    const atOnce = <A, E1, B, E2>(
      round: number,
      one: Effect.Effect<A, E1, App>,
      other: Effect.Effect<B, E2, App>
    ) => {
      const head = Math.floor(round / 2)
      return Effect.runPromise(
        Effect.all(
          [
            Effect.exit(Effect.delay(one, round % 2 === 0 ? head : 0)),
            Effect.exit(Effect.delay(other, round % 2 === 0 ? 0 : head)),
          ],
          { concurrency: 'unbounded' }
        ).pipe(
          delivered,
          Effect.provide(appAs(alex)),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )
    }

    const plantOf = async (life: 'living' | 'dead' = 'living') => {
      const [row] = await db
        .insert(schema.plants)
        .values({
          userId: alex,
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
      await db.insert(schema.plantCareSchedules).values({
        plantId: row.id,
        careType: 'watering',
        frequencyDays: 7,
        nextCareAt: new Date('2026-01-03T00:00:00Z'),
        dueDay: '2026-01-03',
      })
      return row.id
    }

    const acceptedPlanOn = async (plantId: string) => {
      const [plan] = await db
        .insert(schema.carePlans)
        .values({ plantId, userId: alex, title: 'Rescue', status: 'accepted' })
        .returning()
      if (!plan) throw new Error('plan insert returned nothing')
      const [step] = await db
        .insert(schema.carePlanSteps)
        .values({
          planId: plan.id,
          position: 0,
          title: 'Water',
          careType: 'watering',
        })
        .returning()
      if (!step) throw new Error('step insert returned nothing')
      return { planId: plan.id, stepId: step.id }
    }

    const whatIsLeftOf = async (plantId: string) => {
      const { rows } = await pool.query(
        `SELECT
           (SELECT count(*) FROM plants WHERE id = $1)::int AS plants,
           (SELECT count(*) FROM plant_care_schedules WHERE plant_id = $1)::int AS schedules,
           (SELECT count(*) FROM care_logs WHERE plant_id = $1)::int AS cares,
           (SELECT count(*) FROM care_plans WHERE plant_id = $1)::int AS plans,
           (SELECT count(*) FROM diagnoses WHERE plant_id = $1)::int AS diagnoses,
           (SELECT count(*) FROM notifications WHERE plant_id = $1)::int AS notifications`,
        [plantId]
      )
      return rows[0]
    }

    const tick = (planId: string, stepId: string) =>
      withCarePlanStep(planId, stepId, 'tick').pipe(
        Effect.flatMap(completeCarePlanStep)
      )

    const diagnose = (plantId: string) =>
      Effect.flatMap(Effect.context<ToolContext>(), (runtime) =>
        Effect.tryPromise({
          try: async () =>
            await createDiagnosisTool({
              runtime,
              userId: alex,
              permit: chatPermit(plantId, alex),
              plantName: 'Fern',
            }).execute?.(
              {
                diseaseName: 'Root rot',
                severity: 'HIGH',
                confidence: 85,
                symptoms: ['Mushy roots'],
                treatmentSteps: [
                  {
                    title: 'Repot in fresh soil',
                    careType: 'repotting',
                    dueInDays: 0,
                  },
                ],
              },
              { toolCallId: 'call-1', messages: [], context: {} }
            ),
          catch: (error) => error as { readonly _tag: string },
        })
      )

    const unexpected = (
      seen: ReadonlyArray<string>,
      serialOutcomes: ReadonlyArray<string>
    ) =>
      Array.filter(
        Array.dedupe(seen),
        (outcome) => !Array.contains(serialOutcomes, outcome)
      )

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    beforeEach(async () => {
      for (const table of [
        'outbox',
        'notifications',
        'plants',
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
    })

    afterAll(async () => {
      await pool.end()
    })

    it('a remove racing a care ends as one of the two orders, with no defect, no deadlock and nothing of the plant left', async () => {
      const before = await deadlocks(pool)
      const seen: string[] = []

      for (const round of Array.range(1, ROUNDS)) {
        const plantId = await plantOf()
        const [removed, cared] = await atOnce(
          round,
          removeAsCurrentUser(plantId),
          waterAsCurrentUser(plantId)
        )
        seen.push(`remove ${how(removed)}, care ${how(cared)}`)
        expect(await whatIsLeftOf(plantId)).toEqual(NOTHING_OF_THE_PLANT)
      }

      expect(
        unexpected(seen, [
          'remove ran, care ran',
          'remove ran, care PlantNotFoundError',
        ])
      ).toEqual([])
      expect((await deadlocks(pool)) - before).toBe(0)
    }, 60_000)

    it('a remove racing a tick of a plan step ends as one of the two orders, with no defect, no deadlock and nothing of the plant left', async () => {
      const before = await deadlocks(pool)
      const seen: string[] = []

      for (const round of Array.range(1, ROUNDS)) {
        const plantId = await plantOf()
        const { planId, stepId } = await acceptedPlanOn(plantId)
        const [removed, ticked] = await atOnce(
          round,
          removeAsCurrentUser(plantId),
          tick(planId, stepId)
        )
        seen.push(`remove ${how(removed)}, tick ${how(ticked)}`)
        expect(await whatIsLeftOf(plantId)).toEqual(NOTHING_OF_THE_PLANT)
      }

      expect(
        unexpected(seen, [
          'remove ran, tick ran',
          'remove ran, tick CarePlanNotFoundError',
        ])
      ).toEqual([])
      expect((await deadlocks(pool)) - before).toBe(0)
    }, 60_000)

    it('a remove racing a diagnosis ends as one of the two orders, with no defect, no deadlock and no diagnosis or plan left', async () => {
      const before = await deadlocks(pool)
      const seen: string[] = []

      for (const round of Array.range(1, ROUNDS)) {
        const plantId = await plantOf()
        const [removed, diagnosed] = await atOnce(
          round,
          removeAsCurrentUser(plantId),
          diagnose(plantId)
        )
        seen.push(`remove ${how(removed)}, diagnosis ${how(diagnosed)}`)
        expect(await whatIsLeftOf(plantId)).toEqual(NOTHING_OF_THE_PLANT)
      }

      expect(
        unexpected(seen, [
          'remove ran, diagnosis ran',
          'remove ran, diagnosis PlantNotFoundError',
        ])
      ).toEqual([])
      expect((await deadlocks(pool)) - before).toBe(0)
    }, 60_000)

    it('a remove asks for its strongest lock first: behind a session that references the plant, the statement that waits is the lock, not the delete', async () => {
      const plantId = await plantOf()
      const session = await pool.connect()
      try {
        await session.query('BEGIN')
        await session.query(
          'SELECT id FROM plants WHERE id = $1 FOR KEY SHARE',
          [plantId]
        )
        const removing = atOnce(0, removeAsCurrentUser(plantId), Effect.void)
        const waited = await statementsWaitingForALock(pool)
        await session.query('ROLLBACK')
        const [removed] = await removing

        expect(waited).toEqual([
          expect.stringMatching(/^select .* from "plants" .* for update/s),
        ])
        expect(how(removed)).toBe('ran')
      } finally {
        await session.query('ROLLBACK')
        session.release()
      }
    })

    it('a bury racing a revive of a dead plant ends as one of the two orders, with no defect and no deadlock', async () => {
      const before = await deadlocks(pool)
      const seen: string[] = []

      for (const round of Array.range(1, ROUNDS)) {
        await db.execute(sql`TRUNCATE TABLE plants CASCADE`)
        const plantId = await plantOf('dead')
        const [buried, revived] = await atOnce(
          round,
          buryAsCurrentUser(plantId),
          reviveAsCurrentUser(plantId)
        )
        const [row] = await db
          .select({ diedAt: schema.plants.diedAt })
          .from(schema.plants)
          .where(eq(schema.plants.id, plantId))
        seen.push(
          `bury ${how(buried)}, revive ${how(revived)}, ends ${row?.diedAt === null ? 'living' : 'dead'}`
        )
      }

      expect(
        unexpected(seen, [
          'bury PlantAlreadyDeadError, revive ran, ends living',
          'bury ran, revive ran, ends dead',
        ])
      ).toEqual([])
      expect((await deadlocks(pool)) - before).toBe(0)
    }, 60_000)

    it('a revive racing a create at the last free slot lets one of them take it', async () => {
      const [freeTier] = await db
        .select()
        .from(schema.subscriptionTiers)
        .where(eq(schema.subscriptionTiers.tier, 'free'))
      const maxPlants = freeTier?.maxPlants ?? 5
      const before = await deadlocks(pool)
      const seen: string[] = []

      for (const round of Array.range(1, ROUNDS)) {
        await db.execute(sql`TRUNCATE TABLE plants CASCADE`)
        for (const _ of Array.range(1, maxPlants - 1)) await plantOf()
        const dead = await plantOf('dead')
        const [revived, created] = await atOnce(
          round,
          reviveAsCurrentUser(dead),
          createPlant({
            name: 'Last slot',
            wateringFrequencyDays: 7,
            luxNeeded: 2000,
            humidityRating: 3,
            petToxicityRating: 1,
          })
        )
        const [living] = await db
          .select({ value: count() })
          .from(schema.plants)
          .where(
            and(eq(schema.plants.userId, alex), isNull(schema.plants.diedAt))
          )
        seen.push(
          `revive ${how(revived)}, create ${how(created)}, ${living?.value === maxPlants ? 'full' : `${living?.value} living`}`
        )
      }

      expect(
        unexpected(seen, [
          'revive ran, create LimitExceededError, full',
          'revive LimitExceededError, create ran, full',
        ])
      ).toEqual([])
      expect((await deadlocks(pool)) - before).toBe(0)
    }, 60_000)
  }
)
