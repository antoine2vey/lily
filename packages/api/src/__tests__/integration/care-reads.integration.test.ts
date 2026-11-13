import {
  CareReads,
  CareReadsLive,
  type DueQuery,
  DueScope,
  DueWindow,
} from '@lily/api/contexts/care'
import {
  type FindPlantsParams,
  PlantRepository,
  PlantRepositoryLive,
} from '@lily/api/repositories/plant.repository'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { sql } from 'drizzle-orm'
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
      })
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

      // Paris midnight of Nov 11 and Nov 12, as the care paths store them.
      await addPlant('overdue', { userId: parisUserId }, '2026-11-10T23:00:00Z')
      await addPlant('today', { userId: parisUserId }, '2026-11-11T23:00:00Z')
      await addPlant('soon', { userId: parisUserId }, '2026-11-14T23:00:00Z')
      await addPlant('far', { userId: parisUserId }, '2026-12-20T23:00:00Z')
      await addPlant('dead', { userId: parisUserId }, '2026-11-01T23:00:00Z', {
        diedAt: new Date('2026-11-05T00:00:00Z'),
        deathCause: 'unknown',
      })
      // Los Angeles midnight of Nov 11: due today there, although the same
      // instant is "yesterday" for a Paris viewer.
      await addPlant('canopy', { canopyId }, '2026-11-11T08:00:00Z', {
        createdByUserId: memberId,
      })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    const statusByPlant = (cares: Awaited<ReturnType<typeof due>>) =>
      Object.fromEntries(
        Array.map(cares, (care) => [care.plant.name, care.status._tag])
      )

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

    // The plant list reads the same care day through PlantRepository.
    describe('plant list', () => {
      const PlantsLive = PlantRepositoryLive.pipe(
        Layer.provideMerge(DrizzleLive),
        Layer.provideMerge(PgLive)
      )
      const list = (params: FindPlantsParams) =>
        Effect.runPromise(
          Effect.flatMap(PlantRepository, (repo) => repo.findAll(params)).pipe(
            Effect.provide(PlantsLive)
          )
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
        // Due today in Los Angeles: a Paris member must not see it as late.
        await db
          .insert(schema.canopyMembers)
          .values({ canopyId, userId: memberId })
        const memberAll = await list({ userId: memberId, includeCanopy: true })
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
  }
)
