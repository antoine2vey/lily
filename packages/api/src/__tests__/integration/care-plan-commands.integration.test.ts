import {
  CareOnPostgresLive,
  waterAsCurrentUser,
} from '@lily/api/__tests__/integration/care-layers'
import { statementsWaitingForALock } from '@lily/api/__tests__/integration/lock-waits'
import { chatPermit } from '@lily/api/__tests__/mocks/care'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockRagService } from '@lily/api/__tests__/mocks/rag.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { transactInMemory } from '@lily/api/__tests__/mocks/transaction'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import { CarePlans, CareReadsLive } from '@lily/api/contexts/care'
import { CareWrite } from '@lily/api/contexts/care/domain/decide'
import { CareStore, CareStoreLive } from '@lily/api/contexts/care/store'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CarePlanRepositoryLive } from '@lily/api/repositories/care-plan.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { DiagnosisRepositoryLive } from '@lily/api/repositories/diagnosis.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import type { ToolContext } from '@lily/api/services/ai-chat/tools'
import { createDiagnosisTool } from '@lily/api/services/ai-chat/tools/create-diagnosis'
import { acceptCarePlan } from '@lily/api/services/care-plans/endpoints/accept-care-plan'
import { completeCarePlanStep } from '@lily/api/services/care-plans/endpoints/complete-care-plan-step'
import { deleteCarePlanStep } from '@lily/api/services/care-plans/endpoints/delete-care-plan-step'
import { dismissCarePlan } from '@lily/api/services/care-plans/endpoints/dismiss-care-plan'
import { uncompleteCarePlanStep } from '@lily/api/services/care-plans/endpoints/uncomplete-care-plan-step'
import {
  withCarePlanAuth,
  withCarePlanStep,
} from '@lily/api/services/care-plans/helpers/with-care-plan-auth'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { CareDays } from '@lily/shared'
import type { CarePlanStatus } from '@lily/shared/care-plan'
import { and, asc, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import {
  Array,
  Cause,
  DateTime,
  Effect,
  Exit,
  Layer,
  Option,
  Order,
  Result,
} from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const RACES = 12

const RepositoriesLive = Layer.mergeAll(
  CanopyRepositoryLive,
  CareLogRepositoryLive,
  CarePlanRepositoryLive,
  CareScheduleRepositoryLive,
  CareReadsLive,
  DelegationRepositoryLive,
  DiagnosisRepositoryLive,
  NotificationRepositoryLive,
  PlantRepositoryLive,
  UserRepositoryLive,
  createMockMessageQueue(),
  createMockRagService()
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000)
const dayOf = (date: Date) => CareDays.of(DateTime.makeUnsafe(date), 'UTC')

interface SeedStep {
  readonly title: string
  readonly careType?: 'watering' | 'misting'
  readonly dueDate?: Date
  readonly done?: boolean
}

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Care plan commands - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let alexId: string
    let plantId: string

    const dueBeforeAccept = daysFromNow(-3)
    const planDue = daysFromNow(9)

    const layer = () =>
      CareOnPostgresLive.pipe(
        Layer.provideMerge(
          Layer.mergeAll(
            RepositoriesLive,
            createMockEventBus(),
            createMockCurrentUser({ id: alexId }),
            createMockWeatherProvider(),
            createMockWeatherCache(),
            createMockWeatherRepository()
          )
        )
      )

    const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.runPromise(
        effect.pipe(Effect.provide(layer())) as Effect.Effect<A, E>
      )

    const atOnce = <A, B, E1, E2, R1, R2>(
      one: Effect.Effect<A, E1, R1>,
      other: Effect.Effect<B, E2, R2>
    ) =>
      run(
        Effect.all([Effect.result(one), Effect.result(other)], {
          concurrency: 'unbounded',
        })
      )

    const accept = (planId: string) =>
      withCarePlanAuth(planId, 'manage').pipe(Effect.flatMap(acceptCarePlan))
    const dismiss = (planId: string) =>
      withCarePlanAuth(planId, 'manage').pipe(Effect.flatMap(dismissCarePlan))
    const tick = (planId: string, stepId: string) =>
      withCarePlanStep(planId, stepId, 'tick').pipe(
        Effect.flatMap(completeCarePlanStep)
      )
    const untick = (planId: string, stepId: string) =>
      withCarePlanStep(planId, stepId, 'tick').pipe(
        Effect.flatMap(uncompleteCarePlanStep)
      )
    const drop = (planId: string, stepId: string) =>
      withCarePlanStep(planId, stepId, 'manage').pipe(
        Effect.flatMap(deleteCarePlanStep)
      )

    const refusedAs = (
      results: ReadonlyArray<Result.Result<unknown, { readonly _tag: string }>>
    ) =>
      Array.map(results, (result) =>
        Result.isFailure(result) ? result.failure._tag : 'ran'
      ).sort()

    const addPlan = async (
      status: CarePlanStatus,
      steps: ReadonlyArray<SeedStep>
    ) => {
      const [plan] = await db
        .insert(schema.carePlans)
        .values({ plantId, userId: alexId, title: 'Rescue', status })
        .returning()
      if (!plan) throw new Error('plan insert returned nothing')
      const rows = await db
        .insert(schema.carePlanSteps)
        .values(
          Array.map(steps, (step, position) => ({
            planId: plan.id,
            position,
            title: step.title,
            careType: step.careType ?? null,
            dueDate: step.dueDate ?? null,
            completedAt: step.done ? daysFromNow(-1) : null,
          }))
        )
        .returning()
      const inPosition = Order.mapInput(
        Order.Number,
        (row: (typeof rows)[number]) => row.position
      )
      return {
        planId: plan.id,
        stepIds: Array.map(Array.sort(rows, inPosition), (row) => row.id),
      }
    }

    const planNow = async (planId: string) => {
      const [plan] = await db
        .select()
        .from(schema.carePlans)
        .where(eq(schema.carePlans.id, planId))
      const steps = await db
        .select()
        .from(schema.carePlanSteps)
        .where(eq(schema.carePlanSteps.planId, planId))
        .orderBy(asc(schema.carePlanSteps.position))
      return { plan, steps }
    }

    const whatItsStepsSay = (
      steps: ReadonlyArray<{ readonly completedAt: Date | null }>
    ): CarePlanStatus =>
      steps.length > 0 && Array.every(steps, (s) => s.completedAt !== null)
        ? 'completed'
        : 'accepted'

    const wateringDueDay = async () => {
      const [schedule] = await db
        .select()
        .from(schema.plantCareSchedules)
        .where(
          and(
            eq(schema.plantCareSchedules.plantId, plantId),
            eq(schema.plantCareSchedules.careType, 'watering')
          )
        )
      return schedule?.dueDay
    }

    const dueDayMovesTold = async () => {
      const rows = await db
        .select({ id: schema.outbox.id })
        .from(schema.outbox)
        .where(
          and(
            eq(schema.outbox.topic, 'care'),
            sql`${schema.outbox.event}->>'_tag' = 'ScheduleChanged'`,
            sql`${schema.outbox.event}->>'plantId' = ${plantId}`
          )
        )
      return rows.length
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    beforeEach(async () => {
      await db.execute(sql`TRUNCATE TABLE canopies RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      const stamp = Date.now()
      const [alex] = await db
        .insert(schema.users)
        .values({
          email: `alex-${stamp}@example.com`,
          name: `Alex-${stamp}`,
          emailVerified: true,
          timezone: 'UTC',
        })
        .returning()
      if (!alex) throw new Error('user insert returned nothing')
      alexId = alex.id
      const [plant] = await db
        .insert(schema.plants)
        .values({
          name: 'Monstera',
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
          userId: alexId,
          createdByUserId: alexId,
        })
        .returning()
      if (!plant) throw new Error('plant insert returned nothing')
      plantId = plant.id
      await db.insert(schema.plantCareSchedules).values({
        plantId,
        careType: 'watering',
        frequencyDays: 7,
        lastCareAt: daysFromNow(-10),
        nextCareAt: dueBeforeAccept,
        dueDay: dayOf(dueBeforeAccept),
      })
    })

    afterAll(async () => {
      await db.execute(sql`TRUNCATE TABLE canopies RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      await pool.end()
    })

    const wateringOn = (dueDate: Date): SeedStep => ({
      title: 'Water',
      careType: 'watering',
      dueDate,
    })

    it('two accepts of one plan at once: one answers 409, and the due day is moved and told once', async () => {
      for (const round of Array.range(1, RACES)) {
        const due = daysFromNow(9 + round)
        const { planId } = await addPlan('proposed', [wateringOn(due)])

        const results = await atOnce(accept(planId), accept(planId))

        expect(refusedAs(results)).toEqual(['CarePlanNotProposedError', 'ran'])
        expect((await planNow(planId)).plan?.status).toBe('accepted')
        expect(await wateringDueDay()).toBe(dayOf(due))
        expect(await dueDayMovesTold()).toBe(round)
      }
    })

    it('a second accept after a care answers 409 and leaves the due day where the care put it', async () => {
      const { planId } = await addPlan('proposed', [wateringOn(planDue)])
      await run(accept(planId))
      await run(waterAsCurrentUser(plantId))
      const afterTheCare = await wateringDueDay()

      const second = await run(Effect.result(accept(planId)))

      expect(afterTheCare).not.toBe(dayOf(planDue))
      expect(refusedAs([second])).toEqual(['CarePlanNotProposedError'])
      expect(await wateringDueDay()).toBe(afterTheCare)
    })

    it('an accept and a dismiss at once: one wins, and a dismissed plan moved no due day', async () => {
      const seen = new Set<CarePlanStatus>()
      for (const _ of Array.range(1, RACES)) {
        await db
          .update(schema.plantCareSchedules)
          .set({
            nextCareAt: dueBeforeAccept,
            dueDay: dayOf(dueBeforeAccept),
          })
          .where(eq(schema.plantCareSchedules.plantId, plantId))
        const { planId } = await addPlan('proposed', [wateringOn(planDue)])

        const results = await atOnce(accept(planId), dismiss(planId))

        const status = (await planNow(planId)).plan?.status
        expect(refusedAs(results)).toEqual(['CarePlanNotProposedError', 'ran'])
        expect(await wateringDueDay()).toBe(
          status === 'accepted' ? dayOf(planDue) : dayOf(dueBeforeAccept)
        )
        expect(['accepted', 'dismissed']).toContain(status)
        if (status) seen.add(status)
      }
      expect(seen.size).toBeGreaterThan(0)
    })

    it('a tick and an untick of two steps at once: both land, and the status is what the steps say', async () => {
      for (const _ of Array.range(1, RACES)) {
        const {
          planId,
          stepIds: [open, done],
        } = await addPlan('accepted', [
          { title: 'Check the leaves' },
          { title: 'Wipe the dust', done: true },
        ])
        if (!open || !done) throw new Error('steps were not seeded')

        const results = await atOnce(tick(planId, open), untick(planId, done))

        const { plan, steps } = await planNow(planId)
        expect(refusedAs(results)).toEqual(['ran', 'ran'])
        expect(Array.map(steps, (s) => s.completedAt !== null)).toEqual([
          true,
          false,
        ])
        expect(plan?.status).toBe(whatItsStepsSay(steps))
        expect(plan?.completedAt).toBeNull()
      }
    })

    it('a tick and an untick of the same step at once: the status is what the step says', async () => {
      for (const _ of Array.range(1, RACES)) {
        const {
          planId,
          stepIds: [only],
        } = await addPlan('accepted', [{ title: 'Check the leaves' }])
        if (!only) throw new Error('step was not seeded')

        const results = await atOnce(tick(planId, only), untick(planId, only))

        const { plan, steps } = await planNow(planId)
        expect(refusedAs(results)).toEqual(['ran', 'ran'])
        expect(plan?.status).toBe(whatItsStepsSay(steps))
        expect(plan?.completedAt === null).toBe(plan?.status === 'accepted')
      }
    })

    it('a tick and the drop of the other open step at once: the plan completes', async () => {
      for (const _ of Array.range(1, RACES)) {
        const {
          planId,
          stepIds: [ticked, dropped],
        } = await addPlan('accepted', [
          { title: 'Check the leaves' },
          { title: 'Wipe the dust' },
        ])
        if (!ticked || !dropped) throw new Error('steps were not seeded')

        const results = await atOnce(
          tick(planId, ticked),
          drop(planId, dropped)
        )

        const { plan, steps } = await planNow(planId)
        expect(refusedAs(results)).toEqual(['ran', 'ran'])
        expect(Array.map(steps, (s) => s.id)).toEqual([ticked])
        expect(plan?.status).toBe('completed')
        expect(plan?.completedAt).toBeInstanceOf(Date)
      }
    })

    it('unticking a step of a completed plan reopens the plan and clears its completion date', async () => {
      const {
        planId,
        stepIds: [last],
      } = await addPlan('accepted', [{ title: 'Check the leaves' }])
      if (!last) throw new Error('step was not seeded')

      const completed = await run(tick(planId, last))
      const reopened = await run(untick(planId, last))

      expect(completed.status).toBe('completed')
      expect(completed.completedAt).toBeInstanceOf(Date)
      expect(reopened.status).toBe('accepted')
      expect((await planNow(planId)).plan).toMatchObject({
        status: 'accepted',
        completedAt: null,
        acceptedAt: null,
      })
    })

    it('a plan write that finds no row in the state it was decided on dies', async () => {
      const {
        planId,
        stepIds: [done],
      } = await addPlan('proposed', [{ title: 'Check the leaves', done: true }])
      if (!done) throw new Error('step was not seeded')
      const at = DateTime.nowUnsafe()
      const applied = (write: CareWrite) =>
        Effect.flatMap(CareStore, (store) => store.apply([write])).pipe(
          transactInMemory,
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
          CareWrite.SetPlanStatus({
            planId,
            from: 'accepted',
            to: 'completed',
            at,
          })
        ),
        await applied(
          CareWrite.CompletePlanStep({
            stepId: done,
            careLogId: Option.none(),
            at,
          })
        ),
        await applied(
          CareWrite.ReopenPlanStep({ stepId: crypto.randomUUID() })
        ),
        await applied(
          CareWrite.DeletePlanStep({ stepId: crypto.randomUUID() })
        ),
        await applied(CareWrite.DeletePlan({ planId: crypto.randomUUID() })),
        await applied(
          CareWrite.LinkPlanToDiagnosis({
            planId: crypto.randomUUID(),
            diagnosisId: crypto.randomUUID(),
          })
        ),
      ]

      expect(
        Array.map(exits, (exit) =>
          Exit.isFailure(exit) && Cause.hasDies(exit.cause)
            ? String(Cause.squash(exit.cause))
            : 'written'
        )
      ).toEqual(Array.replicate('PlanRowNotWrittenDefect', 6))
      expect((await planNow(planId)).plan?.status).toBe('proposed')
    })

    it('dropping the only step of a plan does not complete it', async () => {
      const {
        planId,
        stepIds: [only],
      } = await addPlan('accepted', [{ title: 'Check the leaves' }])
      if (!only) throw new Error('step was not seeded')

      await run(drop(planId, only))

      const { plan, steps } = await planNow(planId)
      expect(steps).toEqual([])
      expect(plan?.status).toBe('accepted')
    })

    it('a step that is already done moves no due day at accept (a change: accept used to move it to the done step date)', async () => {
      const { planId } = await addPlan('proposed', [
        { ...wateringOn(planDue), done: true },
        { title: 'Check the leaves' },
      ])

      const plan = await run(accept(planId))

      expect(plan.status).toBe('accepted')
      expect(await wateringDueDay()).toBe(dayOf(dueBeforeAccept))
      expect(await dueDayMovesTold()).toBe(0)
    })

    it('accepting a plan whose steps are all done completes it', async () => {
      const { planId } = await addPlan('proposed', [
        { ...wateringOn(planDue), done: true },
      ])

      const plan = await run(accept(planId))

      expect(plan.status).toBe('completed')
      expect(plan.acceptedAt).toBeInstanceOf(Date)
      expect(plan.completedAt).toBeInstanceOf(Date)
    })

    it('a tick on a plan of a buried plant answers 404, records no care and leaves the step open (a change: it used to tick)', async () => {
      const {
        planId,
        stepIds: [water],
      } = await addPlan('accepted', [wateringOn(planDue)])
      if (!water) throw new Error('step was not seeded')
      await db
        .update(schema.plants)
        .set({ diedAt: new Date() })
        .where(eq(schema.plants.id, plantId))

      const results = await atOnce(tick(planId, water), accept(planId))

      const { plan, steps } = await planNow(planId)
      const cares = await db
        .select()
        .from(schema.careLogs)
        .where(eq(schema.careLogs.plantId, plantId))
      expect(refusedAs(results)).toEqual([
        'CarePlanNotFoundError',
        'CarePlanNotFoundError',
      ])
      expect(steps[0]?.completedAt).toBeNull()
      expect(plan?.status).toBe('accepted')
      expect(cares).toEqual([])
    })

    describe('the AI writers', () => {
      const rootRot = {
        diseaseName: 'Root rot',
        severity: 'HIGH',
        confidence: 85,
        symptoms: ['Mushy roots'],
        treatmentSteps: [
          { title: 'Remove affected roots', careType: 'none' },
          { title: 'Repot in fresh soil', careType: 'repotting', dueInDays: 0 },
        ],
      }

      const diagnose = (params: typeof rootRot = rootRot) =>
        Effect.flatMap(Effect.context<ToolContext>(), (runtime) =>
          Effect.tryPromise({
            try: async () =>
              (await createDiagnosisTool({
                runtime,
                userId: alexId,
                permit: chatPermit(plantId, alexId),
                plantName: 'Monstera',
              }).execute?.(params, {
                toolCallId: 'call-1',
                messages: [],
                context: {},
              })) as {
                readonly diagnosisId: string
                readonly carePlanId: string
              },
            catch: (error) => error as { readonly _tag: string },
          })
        )

      const diagnosesNow = () =>
        db
          .select({ id: schema.diagnoses.id })
          .from(schema.diagnoses)
          .where(eq(schema.diagnoses.plantId, plantId))

      const plansNow = () =>
        db
          .select({
            id: schema.carePlans.id,
            diagnosisId: schema.carePlans.diagnosisId,
            status: schema.carePlans.status,
          })
          .from(schema.carePlans)
          .where(eq(schema.carePlans.plantId, plantId))

      const whileAnotherSessionHoldsThePlant = async <A>(
        strength: 'FOR UPDATE' | 'FOR KEY SHARE',
        work: () => Promise<A>
      ) => {
        const session = await pool.connect()
        try {
          await session.query('BEGIN')
          await session.query(
            `SELECT id FROM plants WHERE id = $1 ${strength}`,
            [plantId]
          )
          return await work()
        } finally {
          await session.query('ROLLBACK')
          session.release()
        }
      }

      it('a proposal writes the plan and all its steps, or neither', async () => {
        const step = (careType: string) => ({
          title: 'Hold off watering',
          description: Option.none(),
          careType: Option.some(careType as 'watering'),
          dueAt: Option.none(),
        })
        const propose = (careTypes: ReadonlyArray<string>) =>
          run(
            Effect.exit(
              Effect.flatMap(CarePlans, (carePlans) =>
                carePlans.propose({
                  permit: chatPermit(plantId, alexId),
                  title: 'Rescue',
                  source: 'ai',
                  steps: Array.map(careTypes, step),
                })
              )
            )
          )

        const unwritable = await propose(['watering', 'no such care'])
        const afterTheUnwritable = await plansNow()
        const written = await propose(['watering', 'misting'])

        expect(Exit.isFailure(unwritable)).toBe(true)
        expect(afterTheUnwritable).toEqual([])
        if (!Exit.isSuccess(written)) throw new Error('proposal failed')
        const { plan, steps } = await planNow(written.value.planId)
        expect(plan).toMatchObject({
          status: 'proposed',
          source: 'ai',
          userId: alexId,
          plantId,
        })
        expect(
          Array.map(steps, (s) => [s.position, s.careType, s.completedAt])
        ).toEqual([
          [0, 'watering', null],
          [1, 'misting', null],
        ])
      })

      it('a diagnosis is written with a proposed plan that names it', async () => {
        const diagnosed = await run(diagnose())

        expect(await diagnosesNow()).toEqual([{ id: diagnosed.diagnosisId }])
        expect(await plansNow()).toEqual([
          {
            id: diagnosed.carePlanId,
            diagnosisId: diagnosed.diagnosisId,
            status: 'proposed',
          },
        ])
        expect(
          Array.map((await planNow(diagnosed.carePlanId)).steps, (s) => [
            s.title,
            s.careType,
          ])
        ).toEqual([
          ['Remove affected roots', null],
          ['Repot in fresh soil', 'repotting'],
        ])
      })

      it('a diagnosis of a buried plant answers 404 and writes neither a diagnosis nor a plan (a change: it used to write both)', async () => {
        await db
          .update(schema.plants)
          .set({ diedAt: new Date() })
          .where(eq(schema.plants.id, plantId))

        const refused = await run(Effect.flip(diagnose()))

        expect(refused._tag).toBe('PlantNotFoundError')
        expect(await diagnosesNow()).toEqual([])
        expect(await plansNow()).toEqual([])
      })

      it('a diagnosis that cannot be written leaves no plan behind (a change: the two were separate commits)', async () => {
        const failed = await run(
          Effect.result(diagnose({ ...rootRot, severity: 'NO SUCH SEVERITY' }))
        )

        expect(Result.isFailure(failed)).toBe(true)
        expect(await diagnosesNow()).toEqual([])
        expect(await plansNow()).toEqual([])
      })

      it('a diagnosis whose plan cannot be linked is rolled back with the plan', async () => {
        const whereTheLinkFails = Layer.effect(
          CarePlans,
          Effect.map(CarePlans, (carePlans) =>
            CarePlans.of({
              ...carePlans,
              linkToDiagnosis: () => Effect.die('the link failed'),
            })
          )
        )

        const failed = await run(
          Effect.exit(diagnose().pipe(Effect.provide(whereTheLinkFails)))
        )

        expect(Exit.isFailure(failed)).toBe(true)
        expect(await diagnosesNow()).toEqual([])
        expect(await plansNow()).toEqual([])
      })

      it('a plan is linked to its chat message without the plant lock: the link runs while another session holds the plant row', async () => {
        const { planId } = await addPlan('proposed', [
          { title: 'Check the leaves' },
        ])
        const [conversation] = await db
          .insert(schema.chatConversations)
          .values({ userId: alexId, kind: 'general' })
          .returning()
        if (!conversation) throw new Error('conversation was not seeded')
        const [message] = await db
          .insert(schema.chatMessages)
          .values({
            role: 'user',
            content: 'My monstera droops',
            userId: alexId,
            conversationId: conversation.id,
          })
          .returning()
        if (!message) throw new Error('message was not seeded')

        await whileAnotherSessionHoldsThePlant('FOR UPDATE', () =>
          run(
            Effect.flatMap(CarePlans, (carePlans) =>
              carePlans.linkToMessage({ planId, chatMessageId: message.id })
            ).pipe(
              Effect.timeoutOrElse({
                duration: '5 seconds',
                orElse: () => Effect.die('the link waited on the plant row'),
              })
            )
          )
        )

        expect((await planNow(planId)).plan?.chatMessageId).toBe(message.id)
      })

      it('a diagnosis takes the plant lock before it writes: behind a session that holds the plant row, the statement that waits is the lock, not an insert', async () => {
        const { waiting, diagnosing } = await whileAnotherSessionHoldsThePlant(
          'FOR UPDATE',
          async () => {
            const diagnosing = run(diagnose())
            return {
              diagnosing,
              waiting: await statementsWaitingForALock(pool),
            }
          }
        )
        const diagnosed = await diagnosing

        expect(waiting).toEqual([
          expect.stringMatching(
            /^select .* from "plants" .* for no key update/s
          ),
        ])
        expect(await plansNow()).toEqual([
          {
            id: diagnosed.carePlanId,
            diagnosisId: diagnosed.diagnosisId,
            status: 'proposed',
          },
        ])
      })

      it('a diagnosis asks for nothing stronger than that lock on the plant: it does not wait for a session that holds KEY SHARE', async () => {
        const diagnosed = await whileAnotherSessionHoldsThePlant(
          'FOR KEY SHARE',
          () =>
            run(
              diagnose().pipe(
                Effect.timeoutOrElse({
                  duration: '5 seconds',
                  orElse: () =>
                    Effect.die('the diagnosis waited on the plant row'),
                })
              )
            )
        )

        expect(await diagnosesNow()).toEqual([{ id: diagnosed.diagnosisId }])
      })
    })
  }
)
