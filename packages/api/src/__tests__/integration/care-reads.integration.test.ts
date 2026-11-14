import {
  CareReads,
  CareReadsLive,
  type DueQuery,
  DueScope,
  DueWindow,
} from '@lily/api/contexts/care'
import {
  DelegationRepository,
  DelegationRepositoryLive,
} from '@lily/api/repositories/delegation.repository'
import {
  EngagementRepository,
  EngagementRepositoryLive,
} from '@lily/api/repositories/engagement.repository'
import {
  type FindPlantsParams,
  PlantRepository,
  PlantRepositoryLive,
} from '@lily/api/repositories/plant.repository'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { CareDay, CareDays } from '@lily/shared'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, Effect, Layer, Option, pipe } from 'effect'
import pg from 'pg'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

const { Pool } = pg

const ReadsLive = CareReadsLive.pipe(
  Layer.provideMerge(DrizzleLive),
  Layer.provideMerge(PgLive)
)

const ratings = {
  health: 'HEALTHY' as const,
  humidityRating: 3,
  lightingRating: 3,
  petToxicityRating: 1,
  wateringRating: 3,
}

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'CareReads - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let parisUserId: string
    let memberId: string
    let canopyId: string
    const plantIds: Record<string, string> = {}

    const due = (query: DueQuery) =>
      Effect.runPromise(
        Effect.flatMap(CareReads, (reads) => reads.due(query)).pipe(
          Effect.provide(ReadsLive)
        )
      )

    const addPlant = async (
      name: string,
      owner: { userId: string } | { canopyId: string },
      nextCareAt: string,
      dueDay: string,
      extra: Partial<typeof schema.plants.$inferInsert> = {}
    ) => {
      const [plant] = await db
        .insert(schema.plants)
        .values({ ...ratings, name, ...owner, ...extra })
        .returning()
      if (!plant) throw new Error('plant insert failed')
      plantIds[name] = plant.id
      await db.insert(schema.plantCareSchedules).values({
        plantId: plant.id,
        careType: 'watering',
        frequencyDays: 7,
        nextCareAt: new Date(nextCareAt),
        dueDay,
      })
    }

    const seedPlants = async () => {
      const paris = { userId: parisUserId }
      await addPlant('overdue', paris, '2026-11-10T23:00:00Z', '2026-11-11')
      await addPlant('today', paris, '2026-11-11T23:00:00Z', '2026-11-12')
      await addPlant('soon', paris, '2026-11-14T23:00:00Z', '2026-11-15')
      await addPlant('far', paris, '2026-12-20T23:00:00Z', '2026-12-21')
      await addPlant('dead', paris, '2026-11-01T23:00:00Z', '2026-11-02', {
        diedAt: new Date('2026-11-05T00:00:00Z'),
        deathCause: 'unknown',
      })
      await addPlant(
        'canopy',
        { canopyId },
        '2026-11-11T08:00:00Z',
        '2026-11-11',
        {
          createdByUserId: memberId,
        }
      )
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    afterAll(async () => {
      await pool.end()
    })

    beforeEach(async () => {
      // 23:30 UTC on Nov 11 is already Nov 12 in Paris and still Nov 11 in
      // Los Angeles.
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-11-11T23:30:00Z'))

      await db.execute(sql`TRUNCATE TABLE plants RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE canopies RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)

      const [paris, member] = await db
        .insert(schema.users)
        .values([
          {
            email: 'reads-paris@example.com',
            name: 'Paris',
            emailVerified: true,
            timezone: 'Europe/Paris',
          },
          {
            email: 'reads-member@example.com',
            name: 'Member',
            emailVerified: true,
            timezone: 'Europe/Paris',
          },
        ])
        .returning()
      if (!paris || !member) throw new Error('user insert failed')
      parisUserId = paris.id
      memberId = member.id

      const [canopy] = await db
        .insert(schema.canopies)
        .values({
          name: 'LA canopy',
          timezone: 'America/Los_Angeles',
        })
        .returning()
      if (!canopy) throw new Error('canopy insert failed')
      canopyId = canopy.id
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    const statusByPlant = (cares: Awaited<ReturnType<typeof due>>) =>
      Object.fromEntries(
        Array.map(cares, (care) => [care.plant.name, care.status._tag])
      )

    describe('schedules with a stored due day', () => {
      beforeEach(async () => {
        await seedPlants()
      })

      it('decides status on the owner care day and leaves dead plants out', async () => {
        const cares = await due({
          scope: DueScope.Everyone(),
          upTo: DueWindow.Ahead({ days: 7 }),
        })

        expect(statusByPlant(cares)).toEqual({
          overdue: 'Overdue',
          today: 'DueToday',
          soon: 'Upcoming',
          canopy: 'DueToday',
        })
      })

      it('uses the canopy timezone for a canopy plant', async () => {
        const cares = await due({
          scope: DueScope.Plants({ plantIds: [plantIds.canopy ?? ''] }),
          upTo: DueWindow.DueOrOverdue(),
        })

        const care = pipe(Array.head(cares), Option.getOrThrow)
        expect(care.careTimezone).toBe('America/Los_Angeles')
        expect(care.today).toBe('2026-11-11')
        expect(care.dueDay).toBe('2026-11-11')
        expect(care.plant.owner).toEqual({ _tag: 'Canopy', canopyId })
        expect(care.plant.sharedBy?.id).toBe(memberId)
      })

      it('keeps only strictly overdue cares in the overdue window', async () => {
        const cares = await due({
          scope: DueScope.Everyone(),
          upTo: DueWindow.Overdue(),
        })

        expect(Array.map(cares, (c) => c.plant.name)).toEqual(['overdue'])
        expect(pipe(Array.head(cares), Option.getOrThrow).status).toEqual({
          _tag: 'Overdue',
          daysLate: 1,
        })
      })

      it('scopes to the plants a user cares for', async () => {
        const own = await due({
          scope: DueScope.CaredForBy({ userId: memberId, canopyId: null }),
          upTo: DueWindow.Ahead({ days: 7 }),
        })
        const withCanopy = await due({
          scope: DueScope.CaredForBy({ userId: memberId, canopyId }),
          upTo: DueWindow.Ahead({ days: 7 }),
        })

        expect(own).toEqual([])
        expect(Array.map(withCanopy, (c) => c.plant.name)).toEqual(['canopy'])
      })

      describe('plant list', () => {
        const PlantsLive = PlantRepositoryLive.pipe(
          Layer.provideMerge(DrizzleLive),
          Layer.provideMerge(PgLive)
        )
        const list = (params: FindPlantsParams) =>
          Effect.runPromise(
            Effect.flatMap(PlantRepository, (repo) =>
              repo.findAll(params)
            ).pipe(Effect.provide(PlantsLive))
          )

        it('reports status and derived health on the plant care day', async () => {
          const all = await list({ userId: parisUserId })

          expect(
            Object.fromEntries(
              Array.map(all.items, (p) => [
                p.name,
                [p.health, p.today, p.schedules[0]?.status?._tag],
              ])
            )
          ).toEqual({
            overdue: ['NEEDS_ATTENTION', '2026-11-12', 'Overdue'],
            today: ['HEALTHY', '2026-11-12', 'DueToday'],
            soon: ['HEALTHY', '2026-11-12', 'Upcoming'],
            far: ['HEALTHY', '2026-11-12', 'Upcoming'],
          })
        })

        it('filters overdue and needs-attention after deciding per plant', async () => {
          const overdue = await list({ userId: parisUserId, filter: 'overdue' })
          const attention = await list({
            userId: parisUserId,
            filter: 'needsAttention',
          })
          await db
            .insert(schema.canopyMembers)
            .values({ canopyId, userId: memberId })
          const memberAll = await list({
            userId: memberId,
            includeCanopy: true,
          })
          const member = await list({
            userId: memberId,
            filter: 'overdue',
            includeCanopy: true,
          })

          expect(Array.map(overdue.items, (p) => p.name)).toEqual(['overdue'])
          expect(overdue.total).toBe(1)
          expect(Array.map(attention.items, (p) => p.name)).toEqual(['overdue'])
          expect(Array.map(memberAll.items, (p) => p.name)).toEqual(['canopy'])
          expect(member.items).toEqual([])
        })

        it('uses the canopy timezone for a canopy plant', async () => {
          const plant = await Effect.runPromise(
            Effect.flatMap(PlantRepository, (repo) =>
              repo.findById(plantIds.canopy ?? '')
            ).pipe(Effect.provide(PlantsLive))
          )

          expect(plant?.careTimezone).toBe('America/Los_Angeles')
          expect(plant?.today).toBe('2026-11-11')
          expect(plant?.schedules[0]?.status).toEqual({ _tag: 'DueToday' })
        })
      })
    })

    describe('a stored due day', () => {
      const PlantsLive = PlantRepositoryLive.pipe(
        Layer.provideMerge(DrizzleLive),
        Layer.provideMerge(PgLive)
      )
      const seen = async (name: string) => {
        const plantId = plantIds[name] ?? ''
        const [care] = await due({
          scope: DueScope.Plants({ plantIds: [plantId] }),
          upTo: DueWindow.Any(),
        })
        const plant = await Effect.runPromise(
          Effect.flatMap(PlantRepository, (repo) =>
            repo.findById(plantId)
          ).pipe(Effect.provide(PlantsLive))
        )
        const listed = await Effect.runPromise(
          Effect.flatMap(PlantRepository, (repo) =>
            repo.findAll({ userId: parisUserId })
          ).pipe(Effect.provide(PlantsLive))
        )
        const inList = Array.findFirst(listed.items, (p) => p.id === plantId)
        const seenOn = (
          read: Pick<NonNullable<typeof plant>, 'today' | 'schedules'> | null
        ) => [
          read?.today,
          read?.schedules[0]?.dueDay,
          read?.schedules[0]?.status._tag,
        ]
        return {
          due: [care?.today, care?.dueDay, care?.status._tag],
          plant: seenOn(plant),
          listed: seenOn(Option.getOrNull(inList)),
        }
      }

      it('stays put when the owner changes timezone (declared change: it was re-derived from the instant before)', async () => {
        await addPlant(
          'stored',
          { userId: parisUserId },
          '2026-11-11T23:00:00Z',
          '2026-11-12'
        )
        const before = await seen('stored')

        await db
          .update(schema.users)
          .set({ timezone: 'America/Los_Angeles' })
          .where(eq(schema.users.id, parisUserId))

        const inParis = ['2026-11-12', '2026-11-12', 'DueToday']
        expect(before).toEqual({
          due: inParis,
          plant: inParis,
          listed: inParis,
        })
        const kept = ['2026-11-11', '2026-11-12', 'Upcoming']
        expect(await seen('stored')).toEqual({
          due: kept,
          plant: kept,
          listed: kept,
        })
      })

      it('finds an overdue care by its stored due day, whatever its instant', async () => {
        await addPlant(
          'late by its day',
          { userId: parisUserId },
          '2026-12-20T23:00:00Z',
          '2026-11-10'
        )
        await addPlant(
          'late by its instant only',
          { userId: parisUserId },
          '2026-11-01T23:00:00Z',
          '2026-12-21'
        )

        const cares = await due({
          scope: DueScope.Everyone(),
          upTo: DueWindow.Overdue(),
        })
        const overdue = await Effect.runPromise(
          Effect.flatMap(PlantRepository, (repo) =>
            repo.findAll({ userId: parisUserId, filter: 'overdue' })
          ).pipe(Effect.provide(PlantsLive))
        )

        expect(Array.map(cares, (care) => care.plant.name)).toEqual([
          'late by its day',
        ])
        expect(Array.map(overdue.items, (p) => p.name)).toEqual([
          'late by its day',
        ])
      })

      it('decides the health of a delegated plant and the healthy plant count too', async () => {
        const dueAt = '2026-11-10T23:00:00Z'
        await addPlant('stored', { userId: parisUserId }, dueAt, '2026-11-11')
        const [delegation] = await db
          .insert(schema.careDelegations)
          .values({
            ownerId: parisUserId,
            caretakerId: memberId,
            status: 'active',
            startDate: new Date('2026-11-01T00:00:00Z'),
            endDate: new Date('2026-12-01T00:00:00Z'),
          })
          .returning()
        if (!delegation) throw new Error('delegation insert failed')
        await db.insert(schema.delegationPlants).values({
          delegationId: delegation.id,
          plantId: plantIds.stored ?? '',
        })
        await db
          .update(schema.users)
          .set({ timezone: 'America/Los_Angeles' })
          .where(eq(schema.users.id, parisUserId))

        const [delegated, healthy] = await Effect.runPromise(
          Effect.all([
            Effect.flatMap(DelegationRepository, (repo) =>
              repo.findById(delegation.id)
            ),
            Effect.flatMap(EngagementRepository, (repo) =>
              repo.getHealthyPlantCountForUser(parisUserId)
            ),
          ]).pipe(
            Effect.provide(
              Layer.mergeAll(
                DelegationRepositoryLive,
                EngagementRepositoryLive
              ).pipe(
                Layer.provideMerge(DrizzleLive),
                Layer.provideMerge(PgLive)
              )
            )
          )
        )

        expect(
          Object.fromEntries(
            Array.map(delegated?.plants ?? [], (plant) => [
              plant.name,
              plant.health,
            ])
          )
        ).toEqual({ stored: 'HEALTHY' })
        expect(healthy).toBe(1)
      })

      describe('in the timezone furthest ahead of UTC', () => {
        const kiritimatiPlant = async (name: string, dueDay: string) => {
          const [user] = await db
            .insert(schema.users)
            .values({
              email: `reads-${name}@example.com`,
              name,
              emailVerified: true,
              timezone: 'Pacific/Kiritimati',
            })
            .returning()
          if (!user) throw new Error('user insert failed')
          await addPlant(
            name,
            { userId: user.id },
            `${CareDays.addDays(CareDay.make(dueDay), -1)}T10:00:00Z`,
            dueDay
          )
          return user.id
        }
        const names = (cares: Awaited<ReturnType<typeof due>>) =>
          Array.map(cares, (care) => [care.plant.name, care.status._tag])

        it('lists a care due on a day that has not started in UTC yet', async () => {
          await kiritimatiPlant('ahead', '2026-11-12')

          const cares = await due({
            scope: DueScope.Everyone(),
            upTo: DueWindow.DueOrOverdue(),
          })

          expect(names(cares)).toEqual([['ahead', 'DueToday']])
        })

        it('lists a care due on the last day of the window', async () => {
          await kiritimatiPlant('in-seven-days', '2026-11-19')
          await kiritimatiPlant('in-eight-days', '2026-11-20')

          const cares = await due({
            scope: DueScope.Everyone(),
            upTo: DueWindow.Ahead({ days: 7 }),
          })

          expect(names(cares)).toEqual([['in-seven-days', 'Upcoming']])
        })

        it('lists the plant as overdue from the day after its due day there', async () => {
          const userId = await kiritimatiPlant('late', '2026-11-11')
          await kiritimatiPlant('not-late', '2026-11-12')

          const overdue = await Effect.runPromise(
            Effect.flatMap(PlantRepository, (repo) =>
              repo.findAll({ userId, filter: 'overdue' })
            ).pipe(Effect.provide(PlantsLive))
          )

          expect(Array.map(overdue.items, (p) => p.name)).toEqual(['late'])
        })
      })
    })
  }
)
