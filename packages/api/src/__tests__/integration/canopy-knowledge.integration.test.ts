import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { createMockGCSService } from '@lily/api/__tests__/mocks/gcs.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import {
  CarePlanRepository,
  CarePlanRepositoryLive,
} from '@lily/api/repositories/care-plan.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { DiagnosisRepositoryLive } from '@lily/api/repositories/diagnosis.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import type { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { listPlantCarePlans } from '@lily/api/services/care-plans/endpoints/list-plant-care-plans'
import type { CarePlanAction } from '@lily/api/services/care-plans/helpers/care-plan-access'
import { withCarePlanAuth } from '@lily/api/services/care-plans/helpers/with-care-plan-auth'
import { getDiagnoses } from '@lily/api/services/diagnosis/endpoints/get-diagnoses'
import { withPlantKnowledge } from '@lily/api/services/plants/helpers/with-plant-access'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import type { CarePlanStatus } from '@lily/shared/care-plan'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, Effect, Exit, Layer } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const AppLive = Layer.mergeAll(
  CanopyRepositoryLive,
  CarePlanRepositoryLive,
  DelegationRepositoryLive,
  DiagnosisRepositoryLive,
  PlantRepositoryLive,
  createMockGCSService()
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const as =
  (userId: string) =>
  <A, E>(
    effect: Effect.Effect<A, E, Layer.Success<typeof AppLive> | CurrentUser>
  ) =>
    Effect.runPromiseExit(
      Effect.provide(
        effect,
        Layer.merge(AppLive, createMockCurrentUser({ id: userId }))
      )
    )

const valueOf = <A, E>(exit: Exit.Exit<A, E>): A => {
  if (Exit.isSuccess(exit)) return exit.value
  throw new Error(`Expected success, got ${String(exit)}`)
}

const plantValues = {
  name: 'Monstera',
  humidityRating: 3,
  lightingRating: 3,
  petToxicityRating: 1,
  wateringRating: 3,
}

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000)

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Canopy plant knowledge - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let alexId: string
    let lilyId: string
    let samId: string
    let canopyId: string
    let canopyPlantId: string
    let personalPlantId: string

    const diagnose = async (plantId: string, userId: string, name: string) => {
      const [row] = await db
        .insert(schema.diagnoses)
        .values({
          plantId,
          userId,
          diseaseName: name,
          severity: 'LOW',
          confidence: 80,
          symptoms: [],
          treatmentSteps: [],
        })
        .returning({ id: schema.diagnoses.id })
      if (!row) throw new Error('diagnosis insert returned nothing')
      return row.id
    }

    const plan = async (
      plantId: string,
      userId: string,
      status: CarePlanStatus
    ) => {
      const [row] = await db
        .insert(schema.carePlans)
        .values({ plantId, userId, title: status, status })
        .returning({ id: schema.carePlans.id })
      if (!row) throw new Error('care plan insert returned nothing')
      return row.id
    }

    const diagnosesSeenBy = (userId: string, plantId: string) =>
      as(userId)(
        withPlantKnowledge(plantId, 'diagnose').pipe(
          Effect.flatMap(({ view }) => getDiagnoses({ plantId, view })),
          Effect.map(({ items }) => Array.map(items, (d) => d.diseaseName))
        )
      )

    const plansSeenBy = (userId: string, plantId: string) =>
      as(userId)(
        withPlantKnowledge(plantId, 'view').pipe(
          Effect.flatMap(({ view }) => listPlantCarePlans(plantId, view)),
          Effect.map(({ items }) => Array.map(items, (p) => p.title).sort())
        )
      )

    const planAccess = async (
      userId: string,
      planId: string,
      action: CarePlanAction
    ) => Exit.isSuccess(await as(userId)(withCarePlanAuth(planId, action)))

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    beforeEach(async () => {
      await db.execute(sql`TRUNCATE TABLE canopies RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      const stamp = Date.now()
      const [alex, lily, sam] = await db
        .insert(schema.users)
        .values(
          Array.map(['Alex', 'Lily', 'Sam'], (name) => ({
            email: `${name}-${stamp}@example.com`,
            name: `${name}-${stamp}`,
            emailVerified: true,
          }))
        )
        .returning()
      if (!alex || !lily || !sam)
        throw new Error('user insert returned nothing')
      alexId = alex.id
      lilyId = lily.id
      samId = sam.id
      const [canopy] = await db
        .insert(schema.canopies)
        .values({ name: 'Home' })
        .returning()
      if (!canopy) throw new Error('canopy insert returned nothing')
      canopyId = canopy.id
      await db.insert(schema.canopyMembers).values([
        { canopyId, userId: alexId, role: 'owner' },
        { canopyId, userId: lilyId, role: 'member' },
      ])
      const [canopyPlant, personalPlant] = await db
        .insert(schema.plants)
        .values([
          { ...plantValues, canopyId, createdByUserId: alexId },
          { ...plantValues, userId: alexId, createdByUserId: alexId },
        ])
        .returning()
      if (!canopyPlant || !personalPlant)
        throw new Error('plant insert returned nothing')
      canopyPlantId = canopyPlant.id
      personalPlantId = personalPlant.id
      const [delegation] = await db
        .insert(schema.careDelegations)
        .values({
          ownerId: alexId,
          caretakerId: lilyId,
          status: 'active',
          startDate: inDays(-1),
          endDate: inDays(5),
          respondedAt: inDays(-2),
        })
        .returning({ id: schema.careDelegations.id })
      if (!delegation) throw new Error('delegation insert returned nothing')
      await db
        .insert(schema.delegationPlants)
        .values({ delegationId: delegation.id, plantId: personalPlantId })
    })

    afterAll(async () => {
      await db.execute(sql`TRUNCATE TABLE canopies RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      await pool.end()
    })

    it('shows every member the diagnoses run on a Canopy plant', async () => {
      await diagnose(canopyPlantId, alexId, 'alex-rot')
      await diagnose(canopyPlantId, lilyId, 'lily-mites')

      expect(valueOf(await diagnosesSeenBy(lilyId, canopyPlantId))).toEqual(
        expect.arrayContaining(['alex-rot', 'lily-mites'])
      )
      expect(
        valueOf(await diagnosesSeenBy(alexId, canopyPlantId))
      ).toHaveLength(2)
      expect(
        failureOf(await diagnosesSeenBy(samId, canopyPlantId))
      ).toBeInstanceOf(PlantNotFoundError)
    })

    it('keeps diagnoses on a personal plant with whoever ran them', async () => {
      await diagnose(personalPlantId, alexId, 'alex-rot')
      await diagnose(personalPlantId, lilyId, 'lily-mites')

      expect(valueOf(await diagnosesSeenBy(alexId, personalPlantId))).toEqual([
        'alex-rot',
      ])
      expect(valueOf(await diagnosesSeenBy(lilyId, personalPlantId))).toEqual([
        'lily-mites',
      ])
    })

    it('shares accepted and completed plans on a Canopy plant, not proposals', async () => {
      const accepted = await plan(canopyPlantId, alexId, 'accepted')
      await plan(canopyPlantId, alexId, 'completed')
      const proposed = await plan(canopyPlantId, alexId, 'proposed')
      await plan(canopyPlantId, alexId, 'dismissed')
      await plan(canopyPlantId, lilyId, 'proposed')

      expect(valueOf(await plansSeenBy(lilyId, canopyPlantId))).toEqual([
        'accepted',
        'completed',
        'proposed',
      ])
      expect(valueOf(await plansSeenBy(alexId, canopyPlantId))).toEqual([
        'accepted',
        'completed',
        'dismissed',
        'proposed',
      ])
      expect(await planAccess(lilyId, accepted, 'tick')).toBe(true)
      expect(await planAccess(lilyId, accepted, 'manage')).toBe(false)
      expect(await planAccess(lilyId, proposed, 'tick')).toBe(false)
      expect(await planAccess(samId, accepted, 'tick')).toBe(false)
    })

    it('keeps plans on a personal plant with their author', async () => {
      const alexs = await plan(personalPlantId, alexId, 'accepted')
      await plan(personalPlantId, lilyId, 'accepted')

      expect(valueOf(await plansSeenBy(alexId, personalPlantId))).toEqual([
        'accepted',
      ])
      expect(valueOf(await plansSeenBy(lilyId, personalPlantId))).toEqual([
        'accepted',
      ])
      expect(await planAccess(lilyId, alexs, 'tick')).toBe(false)
    })

    it('cuts a member off from Canopy diagnoses and plans when they leave', async () => {
      await diagnose(canopyPlantId, alexId, 'alex-rot')
      const lilys = await plan(canopyPlantId, lilyId, 'accepted')
      await db
        .delete(schema.canopyMembers)
        .where(eq(schema.canopyMembers.userId, lilyId))

      expect(
        failureOf(await diagnosesSeenBy(lilyId, canopyPlantId))
      ).toBeInstanceOf(PlantNotFoundError)
      expect(
        failureOf(await plansSeenBy(lilyId, canopyPlantId))
      ).toBeInstanceOf(PlantNotFoundError)
      expect(await planAccess(lilyId, lilys, 'manage')).toBe(false)
      expect(valueOf(await plansSeenBy(alexId, canopyPlantId))).toEqual([
        'accepted',
      ])
      const stored = await Effect.runPromise(
        Effect.provide(
          Effect.flatMap(CarePlanRepository, (repo) => repo.findById(lilys)),
          AppLive
        )
      )
      expect(stored?.userId).toBe(lilyId)
    })

    it('lets the Canopy owner manage a shared plan once its author leaves', async () => {
      await db
        .insert(schema.canopyMembers)
        .values({ canopyId, userId: samId, role: 'member' })
      const accepted = await plan(canopyPlantId, lilyId, 'accepted')
      const proposed = await plan(canopyPlantId, lilyId, 'proposed')

      expect(await planAccess(alexId, accepted, 'manage')).toBe(false)

      await db
        .delete(schema.canopyMembers)
        .where(eq(schema.canopyMembers.userId, lilyId))

      expect(await planAccess(alexId, accepted, 'manage')).toBe(true)
      expect(await planAccess(samId, accepted, 'manage')).toBe(false)
      expect(await planAccess(samId, accepted, 'tick')).toBe(true)
      expect(await planAccess(alexId, proposed, 'manage')).toBe(false)
    })
  }
)
