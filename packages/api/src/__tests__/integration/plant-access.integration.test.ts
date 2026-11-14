import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import {
  CarePlanRepository,
  CarePlanRepositoryLive,
} from '@lily/api/repositories/care-plan.repository'
import {
  CareScheduleRepository,
  CareScheduleRepositoryLive,
} from '@lily/api/repositories/care-schedule.repository'
import {
  DelegationRepository,
  DelegationRepositoryLive,
} from '@lily/api/repositories/delegation.repository'
import {
  PlantRepository,
  PlantRepositoryLive,
} from '@lily/api/repositories/plant.repository'
import {
  RoomRepository,
  RoomRepositoryLive,
} from '@lily/api/repositories/room.repository'
import { withCarePlanAuth } from '@lily/api/services/care-plans/helpers/with-care-plan-auth'
import {
  resolvePlantRole,
  withPlantAuth,
} from '@lily/api/services/plants/helpers/with-plant-access'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import type { CanopyId, PlantOwner, UserStatus } from '@lily/shared'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, Effect, Exit, Layer, Option, Record, String } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const RepositoriesLive = Layer.mergeAll(
  PlantRepositoryLive,
  RoomRepositoryLive,
  CanopyRepositoryLive,
  CarePlanRepositoryLive,
  CareScheduleRepositoryLive,
  DelegationRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const run = <A, E>(
  effect: Effect.Effect<A, E, PlantRepository | RoomRepository>
) => Effect.runPromise(effect.pipe(Effect.provide(RepositoriesLive)))

const plantValues = {
  name: 'Monstera',
  humidityRating: 3,
  lightingRating: 3,
  petToxicityRating: 1,
  wateringRating: 3,
}

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Plant and room access - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let alexId: string
    let lilyId: string
    let samId: string
    let canopyId: CanopyId
    let canopyOwner: PlantOwner
    let alexOwner: PlantOwner

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
        .values([
          {
            email: `alex-${stamp}@example.com`,
            name: 'Alex',
            emailVerified: true,
          },
          {
            email: `lily-${stamp}@example.com`,
            name: 'Lily',
            emailVerified: true,
          },
          {
            email: `sam-${stamp}@example.com`,
            name: 'Sam',
            emailVerified: true,
          },
        ])
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
      canopyId = canopy.id as CanopyId
      canopyOwner = { _tag: 'Canopy', canopyId }
      alexOwner = { _tag: 'User', userId: alexId }
      await db.insert(schema.canopyMembers).values([
        { canopyId, userId: alexId, role: 'owner' },
        { canopyId, userId: lilyId, role: 'member' },
      ])
    })

    afterAll(async () => {
      await db.execute(sql`TRUNCATE TABLE canopies RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      await pool.end()
    })

    const insertPlant = async (owner: PlantOwner, name = 'Monstera') => {
      const [plant] = await db
        .insert(schema.plants)
        .values({
          ...plantValues,
          name,
          ...(owner._tag === 'User'
            ? { userId: owner.userId }
            : { canopyId: owner.canopyId }),
          createdByUserId: alexId,
        })
        .returning()
      if (!plant) throw new Error('plant insert returned nothing')
      return plant
    }

    it('lists Canopy plants for a member only when asked, with total equal to items', async () => {
      await insertPlant(alexOwner, 'Mine')
      await insertPlant(canopyOwner, 'Shared one')
      await insertPlant(canopyOwner, 'Shared two')

      const [personalOnly, withCanopy, stranger] = await run(
        Effect.gen(function* () {
          const repo = yield* PlantRepository
          return yield* Effect.all([
            repo.findAll({ userId: alexId }),
            repo.findAll({
              userId: alexId,
              includeCanopy: true,
            }),
            repo.findAll({
              userId: samId,
              includeCanopy: true,
            }),
          ])
        })
      )

      expect(Array.map(personalOnly.items, (p) => p.ownership)).toEqual([
        'owned',
      ])
      expect(personalOnly.total).toBe(1)
      expect(withCanopy.total).toBe(3)
      expect(withCanopy.items).toHaveLength(3)
      expect(
        Array.filter(withCanopy.items, (p) => p.ownership === 'canopy').map(
          (p) => (p.ownership === 'canopy' ? p.canopy.name : null)
        )
      ).toEqual(['Home', 'Home'])
      expect(stranger.total).toBe(0)
    })

    it('answers a hidden plant and a missing plant alike when the id is sent in uppercase', async () => {
      const plant = await insertPlant(canopyOwner)
      const hiddenId = String.toUpperCase(plant.id)
      const missingId = String.toUpperCase(
        'a0b1c2d3-e4f5-4a6b-8c7d-e8f9a0b1c2d3'
      )
      const asSam = createMockCurrentUser({ id: samId })

      const [hidden, missing] = await Promise.all([
        Effect.runPromiseExit(
          withPlantAuth(hiddenId, 'view').pipe(
            Effect.provide(Layer.mergeAll(RepositoriesLive, asSam))
          )
        ),
        Effect.runPromiseExit(
          withPlantAuth(missingId, 'view').pipe(
            Effect.provide(Layer.mergeAll(RepositoriesLive, asSam))
          )
        ),
      ])

      expect(failureOf(hidden)).toEqual(
        new PlantNotFoundError({ plantId: hiddenId })
      )
      expect(failureOf(missing)).toEqual(
        new PlantNotFoundError({ plantId: missingId })
      )
    })

    it('keeps Canopy plants out of a caretaking list that did not ask for them', async () => {
      await insertPlant(alexOwner, 'Mine')
      await insertPlant(canopyOwner, 'Shared')

      const oldBuild = await run(
        Effect.gen(function* () {
          const repo = yield* PlantRepository
          return yield* repo.findAll({
            userId: alexId,
            includeCaretaking: true,
          })
        })
      )

      expect(Array.map(oldBuild.items, (p) => p.ownership)).toEqual(['owned'])
      expect(oldBuild.total).toBe(1)
    })

    it('lists Canopy rooms for a member only when asked', async () => {
      await db.insert(schema.rooms).values([
        { name: 'Alex room', userId: alexId },
        { name: 'Canopy room', canopyId },
      ])

      const [personalOnly, withCanopy, stranger] = await run(
        Effect.gen(function* () {
          const repo = yield* RoomRepository
          return yield* Effect.all([
            repo.findAll({ userId: alexId }),
            repo.findAll({ userId: alexId, includeCanopy: true }),
            repo.findAll({ userId: samId, includeCanopy: true }),
          ])
        })
      )

      expect(Array.map(personalOnly, (r) => r.name)).toEqual(['Alex room'])
      expect(Array.map(withCanopy, (r) => r.name).sort()).toEqual([
        'Alex room',
        'Canopy room',
      ])
      expect(Array.map(withCanopy, (r) => r.owner._tag).sort()).toEqual([
        'Canopy',
        'User',
      ])
      expect(stranger).toEqual([])
    })

    it('refuses a plant update scoped to the wrong owner and leaves the row untouched', async () => {
      const plant = await insertPlant(canopyOwner)

      const renamed = await run(
        Effect.flatMap(PlantRepository, (repo) =>
          repo.update(plant.id, alexOwner, { name: 'Stolen' })
        )
      )
      const [row] = await db
        .select()
        .from(schema.plants)
        .where(eq(schema.plants.id, plant.id))

      expect(renamed).toBeNull()
      expect(row).toMatchObject({ name: 'Monstera', diedAt: null })
    })

    it('applies a plant mutation scoped to the right owner', async () => {
      const plant = await insertPlant(canopyOwner)

      const renamed = await run(
        Effect.gen(function* () {
          const repo = yield* PlantRepository
          return yield* repo.update(plant.id, canopyOwner, { name: 'Ours' })
        })
      )

      expect(renamed).toMatchObject({ name: 'Ours', owner: canopyOwner })
    })

    it('refuses a room mutation scoped to the wrong owner', async () => {
      const [room] = await db
        .insert(schema.rooms)
        .values({ name: 'Canopy room', canopyId })
        .returning()
      if (!room) throw new Error('room insert returned nothing')

      const [renamed, deleted] = await run(
        Effect.gen(function* () {
          const repo = yield* RoomRepository
          return yield* Effect.all([
            repo.update(room.id, alexOwner, { name: 'Stolen' }),
            repo.delete(room.id, alexOwner),
          ])
        })
      )
      const [row] = await db
        .select()
        .from(schema.rooms)
        .where(eq(schema.rooms.id, room.id))

      expect([renamed, deleted]).toEqual([null, null])
      expect(row?.name).toBe('Canopy room')
    })

    describe("a caretaker's place on a delegated plant", () => {
      const DAY = 86_400_000

      const samTendsAPlantOfAlex = async (status: UserStatus) => {
        const plant = await insertPlant(alexOwner, 'Tended')
        const [delegation] = await db
          .insert(schema.careDelegations)
          .values({
            ownerId: alexId,
            caretakerId: samId,
            status: 'active',
            startDate: new Date(Date.now() - DAY),
            endDate: new Date(Date.now() + 7 * DAY),
          })
          .returning()
        if (!delegation) throw new Error('delegation insert returned nothing')
        await db
          .insert(schema.delegationPlants)
          .values({ delegationId: delegation.id, plantId: plant.id })
        const [plan] = await db
          .insert(schema.carePlans)
          .values({ plantId: plant.id, userId: samId, title: 'Repot' })
          .returning()
        if (!plan) throw new Error('care plan insert returned nothing')
        await db
          .update(schema.users)
          .set({ status })
          .where(eq(schema.users.id, samId))
        return { plantId: plant.id, planId: plan.id }
      }

      const whatSamHolds = ({
        plantId,
        planId,
      }: {
        readonly plantId: string
        readonly planId: string
      }) =>
        Effect.runPromise(
          Effect.gen(function* () {
            const plantRepo = yield* PlantRepository
            const planRepo = yield* CarePlanRepository
            const scheduleRepo = yield* CareScheduleRepository
            const delegationRepo = yield* DelegationRepository
            const plant = yield* plantRepo.findById(plantId)
            if (!plant) return yield* Effect.die('the tended plant is gone')
            const role = yield* resolvePlantRole(plant)
            const caretaking = yield* plantRepo.findAll({
              userId: samId,
              includeCaretaking: true,
            })
            const tasks =
              yield* delegationRepo.findActiveDelegationsForCaretaker(samId)
            const ownPlans = yield* planRepo.findByUser(samId)
            const planAccess = yield* Effect.exit(
              withCarePlanAuth(planId, 'tick')
            )
            const reminded =
              yield* delegationRepo.findActiveCaretakersForPlants([plantId])
            const overdueAudience = yield* scheduleRepo.findReminderAudience([
              plantId,
            ])
            const replanned =
              yield* plantRepo.findPersonalReminderPlantIds(samId)
            return {
              role: Option.getOrNull(Option.map(role, (held) => held._tag)),
              caretakingList: Array.map(caretaking.items, (item) => item.name),
              delegatedTasks: Array.map(tasks, (task) => task.plantName),
              ownPlans: Array.map(ownPlans, (own) => own.id),
              mayTickThePlan: Exit.isSuccess(planAccess),
              remindedInPlaceOfTheOwner: Array.map(
                reminded,
                (caretaker) => caretaker.caretakerId
              ),
              toldOfOverdueCare: Array.map(
                Array.flatten(Record.values(overdueAudience)),
                (reminded) => reminded.recipientId
              ),
              plantsReplannedForSam: replanned,
            }
          }).pipe(
            Effect.provide(
              Layer.mergeAll(
                RepositoriesLive,
                createMockCurrentUser({ id: samId })
              )
            )
          )
        )

      it('is the Caretaker role, the plant in every caretaker list and the reminders, while their account is active', async () => {
        const tended = await samTendsAPlantOfAlex('active')

        expect(await whatSamHolds(tended)).toEqual({
          role: 'Caretaker',
          caretakingList: ['Tended'],
          delegatedTasks: ['Tended'],
          ownPlans: [tended.planId],
          mayTickThePlan: true,
          remindedInPlaceOfTheOwner: [samId],
          toldOfOverdueCare: [samId],
          plantsReplannedForSam: [tended.plantId],
        })
      })

      it.each([
        'pending_deletion',
        'suspended',
        'banned',
      ] as const satisfies ReadonlyArray<Exclude<UserStatus, 'active'>>)(
        'is nothing once their account is %s, and the owner is reminded again',
        async (status) => {
          const tended = await samTendsAPlantOfAlex(status)

          expect(await whatSamHolds(tended)).toEqual({
            role: null,
            caretakingList: [],
            delegatedTasks: [],
            ownPlans: [],
            mayTickThePlan: false,
            remindedInPlaceOfTheOwner: [],
            toldOfOverdueCare: [alexId],
            plantsReplannedForSam: [],
          })
        }
      )
    })
  }
)
