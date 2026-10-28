import {
  AchievementRepository,
  AchievementRepositoryLive,
} from '@lily/api/repositories/achievement.repository'
import {
  CareLogRepository,
  CareLogRepositoryLive,
} from '@lily/api/repositories/care-log.repository'
import {
  EngagementRepository,
  EngagementRepositoryLive,
} from '@lily/api/repositories/engagement.repository'
import {
  FollowRepository,
  FollowRepositoryLive,
} from '@lily/api/repositories/follow.repository'
import { processEvent } from '@lily/api/services/achievements/checker'
import { AchievementNotifier } from '@lily/api/services/achievements/notifier'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, Effect, Layer } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const AppLive = Layer.mergeAll(
  AchievementRepositoryLive,
  CareLogRepositoryLive,
  EngagementRepositoryLive,
  FollowRepositoryLive,
  Layer.succeed(AchievementNotifier, {
    notify: () => Effect.void,
    subscribe: Effect.die('subscribe is not used here'),
  })
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const run = <A, E>(
  effect: Effect.Effect<A, E, Layer.Success<typeof AppLive>>
) => Effect.runPromise(Effect.provide(effect, AppLive))

const achievements = Effect.flatMap(AchievementRepository, Effect.succeed)

const plantValues = {
  name: 'Monstera',
  humidityRating: 3,
  lightingRating: 3,
  petToxicityRating: 1,
  wateringRating: 3,
}

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000)

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Canopy stats credit the actor - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let alexId: string
    let lilyId: string
    let samId: string
    let canopyId: string
    let alexsCanopyPlant: string
    let lilysCanopyPlant: string
    let alexsPersonalPlant: string

    const careBy = (
      userId: string,
      plantId: string,
      days: ReadonlyArray<number>
    ) =>
      db.insert(schema.careLogs).values(
        Array.map(days, (d) => ({
          plantId,
          type: 'watering' as const,
          date: daysAgo(d),
          performedByUserId: userId,
        }))
      )

    const streakOf = (userId: string) =>
      run(Effect.flatMap(achievements, (repo) => repo.getCareStreak(userId)))

    const unlocked = async (userId: string) =>
      Array.map(
        await run(
          Effect.flatMap(achievements, (repo) => repo.findByUserId(userId))
        ),
        (a) => a.achievement
      )

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
      const created = await db
        .insert(schema.plants)
        .values([
          { ...plantValues, canopyId, createdByUserId: alexId },
          { ...plantValues, canopyId, createdByUserId: alexId },
          { ...plantValues, canopyId, createdByUserId: alexId },
          { ...plantValues, canopyId, createdByUserId: lilyId },
          { ...plantValues, userId: alexId, createdByUserId: alexId },
        ])
        .returning({ id: schema.plants.id })
      const ids = Array.map(created, (p) => p.id)
      alexsCanopyPlant = ids[0] ?? ''
      lilysCanopyPlant = ids[3] ?? ''
      alexsPersonalPlant = ids[4] ?? ''
    })

    afterAll(async () => {
      await db.execute(sql`TRUNCATE TABLE canopies RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      await pool.end()
    })

    it('credits a Canopy streak to the member who watered, not the creator', async () => {
      await careBy(lilyId, alexsCanopyPlant, [0, 1, 2])

      expect(await streakOf(lilyId)).toBe(3)
      expect(await streakOf(alexId)).toBe(0)

      await run(
        processEvent({
          _tag: 'CareLogCreated',
          userId: lilyId,
          plantId: alexsCanopyPlant,
          careLogId: 'log',
          type: 'watering',
        })
      )
      await run(
        processEvent({
          _tag: 'CareLogCreated',
          userId: alexId,
          plantId: alexsCanopyPlant,
          careLogId: 'log',
          type: 'watering',
        })
      )
      expect(await unlocked(lilyId)).toContain('DEDICATED_CARETAKER')
      expect(await unlocked(alexId)).not.toContain('DEDICATED_CARETAKER')
    })

    it("credits a caretaker's care on a delegated plant to the caretaker's own streak", async () => {
      await careBy(samId, alexsPersonalPlant, [0, 1, 2])
      await careBy(alexId, alexsPersonalPlant, [5])

      expect(await streakOf(samId)).toBe(3)
      expect(await streakOf(alexId)).toBe(0)
      const batch = await run(
        Effect.flatMap(achievements, (repo) =>
          repo.getBatchCareStreaks([alexId, samId])
        )
      )
      expect(batch.get(samId)).toBe(3)
      expect(batch.has(alexId)).toBe(false)
      expect(
        await run(
          Effect.flatMap(achievements, (repo) =>
            repo.countCareLogsByType(samId, 'watering')
          )
        )
      ).toBe(3)
      expect(
        await run(
          Effect.flatMap(achievements, (repo) =>
            repo.countCareLogsByType(alexId, 'watering')
          )
        )
      ).toBe(1)
    })

    it('counts care for the weekly recap and the profile by actor', async () => {
      await careBy(lilyId, alexsCanopyPlant, [0])
      await careBy(lilyId, lilysCanopyPlant, [0])
      await careBy(samId, alexsPersonalPlant, [0])

      const counts = await run(
        Effect.gen(function* () {
          const engagement = yield* EngagementRepository
          const careLogs = yield* CareLogRepository
          return {
            lilyWeek: yield* engagement.getCareLogsCountForWeek(lilyId, 'UTC'),
            alexWeek: yield* engagement.getCareLogsCountForWeek(alexId, 'UTC'),
            samWeek: yield* engagement.getCareLogsCountForWeek(samId, 'UTC'),
            lilyTotal: yield* careLogs.countByUser(lilyId),
            alexTotal: yield* careLogs.countByUser(alexId),
          }
        })
      )

      expect(counts).toMatchObject({
        lilyWeek: 2,
        alexWeek: 0,
        samWeek: 1,
        lilyTotal: 2,
        alexTotal: 0,
      })
    })

    it('dates the inactivity check from care on plants the user holds or did', async () => {
      const [rae] = await db
        .insert(schema.users)
        .values({ email: `rae-${Date.now()}@example.com`, emailVerified: true })
        .returning({ id: schema.users.id })
      if (!rae) throw new Error('user insert returned nothing')
      await careBy(samId, alexsPersonalPlant, [2])
      await careBy(alexId, lilysCanopyPlant, [3])

      const last = await run(
        Effect.gen(function* () {
          const engagement = yield* EngagementRepository
          return {
            alex: yield* engagement.getLastCareDate(alexId),
            lily: yield* engagement.getLastCareDate(lilyId),
            sam: yield* engagement.getLastCareDate(samId),
            rae: yield* engagement.getLastCareDate(rae.id),
          }
        })
      )
      const day = (date: Date | null) =>
        date === null
          ? null
          : Math.round((Date.now() - date.getTime()) / 86_400_000)

      expect({
        alex: day(last.alex),
        lily: day(last.lily),
        sam: day(last.sam),
        rae: day(last.rae),
      }).toEqual({ alex: 2, lily: 3, sam: 2, rae: null })
    })

    it('counts plants by creator for achievements and the public profile', async () => {
      await db
        .update(schema.plants)
        .set({ diedAt: daysAgo(1) })
        .where(eq(schema.plants.id, alexsCanopyPlant))

      const counts = await run(
        Effect.gen(function* () {
          const repo = yield* AchievementRepository
          const follow = yield* FollowRepository
          return {
            alexPlants: yield* repo.countPlants(alexId),
            lilyPlants: yield* repo.countPlants(lilyId),
            samPlants: yield* repo.countPlants(samId),
            alexProfile: yield* follow.getPublicProfile({
              targetUserId: alexId,
              currentUserId: samId,
            }),
            lilyProfile: yield* follow.getPublicProfile({
              targetUserId: lilyId,
              currentUserId: samId,
            }),
          }
        })
      )

      expect(counts.alexPlants).toBe(4)
      expect(counts.lilyPlants).toBe(1)
      expect(counts.samPlants).toBe(0)
      expect(counts.alexProfile?.plantCount).toBe(3)
      expect(counts.alexProfile?.recentPlants).toHaveLength(3)
      expect(counts.lilyProfile?.plantCount).toBe(1)
      expect(
        Array.map(counts.lilyProfile?.recentPlants ?? [], (p) => p.id)
      ).toEqual([lilysCanopyPlant])
    })

    it('counts only the created plants a profile can show', async () => {
      await db
        .update(schema.plants)
        .set({ canopyId: null, userId: alexId })
        .where(eq(schema.plants.id, lilysCanopyPlant))

      const profile = await run(
        Effect.flatMap(FollowRepository, (follow) =>
          follow.getPublicProfile({
            targetUserId: lilyId,
            currentUserId: samId,
          })
        )
      )

      expect(profile?.plantCount).toBe(0)
      expect(profile?.recentPlants).toEqual([])
    })

    it('keeps a plant out of the creator’s profile list once they leave its Canopy', async () => {
      await db
        .delete(schema.canopyMembers)
        .where(eq(schema.canopyMembers.userId, lilyId))

      const profile = await run(
        Effect.flatMap(FollowRepository, (follow) =>
          follow.getPublicProfile({
            targetUserId: lilyId,
            currentUserId: samId,
          })
        )
      )

      expect(profile?.plantCount).toBe(0)
      expect(profile?.recentPlants).toEqual([])
    })

    it('reconciles every plant creator, plant owner and care actor', async () => {
      const [rae] = await db
        .insert(schema.users)
        .values({ email: `rae-${Date.now()}@example.com`, emailVerified: true })
        .returning({ id: schema.users.id })
      if (!rae) throw new Error('user insert returned nothing')
      await db
        .insert(schema.plants)
        .values({ ...plantValues, userId: samId, createdByUserId: alexId })
      await careBy(rae.id, alexsPersonalPlant, [0])

      const ids = await run(
        Effect.flatMap(achievements, (repo) => repo.findUserIdsWithProgress())
      )

      expect([...ids].sort()).toEqual([alexId, lilyId, samId, rae.id].sort())
    })

    it('counts a member’s healthy Canopy plants in their weekly recap', async () => {
      await db
        .update(schema.plants)
        .set({ health: 'NEEDS_ATTENTION' })
        .where(eq(schema.plants.id, alexsCanopyPlant))

      const healthy = await run(
        Effect.gen(function* () {
          const engagement = yield* EngagementRepository
          return {
            alex: yield* engagement.getHealthyPlantCountForUser(alexId),
            lily: yield* engagement.getHealthyPlantCountForUser(lilyId),
            sam: yield* engagement.getHealthyPlantCountForUser(samId),
          }
        })
      )

      expect(healthy).toEqual({ alex: 4, lily: 3, sam: 0 })
    })

    it('names who did each care in the history, and no one once they are gone', async () => {
      await careBy(lilyId, alexsCanopyPlant, [1])
      await careBy(samId, alexsCanopyPlant, [2])
      await careBy(alexId, alexsCanopyPlant, [3])
      await db
        .update(schema.users)
        .set({ deletedAt: new Date() })
        .where(eq(schema.users.id, samId))

      const history = () =>
        run(
          Effect.flatMap(CareLogRepository, (repo) =>
            repo.findByPlantId({ plantId: alexsCanopyPlant })
          )
        ).then(({ items }) => Array.map(items, (i) => i.performedBy))

      expect(await history()).toEqual([
        { id: lilyId, name: expect.stringMatching(/^Lily-/) },
        null,
        { id: alexId, name: expect.stringMatching(/^Alex-/) },
      ])

      await db.delete(schema.users).where(eq(schema.users.id, lilyId))
      expect(await history()).toEqual([
        null,
        null,
        { id: alexId, name: expect.stringMatching(/^Alex-/) },
      ])
    })
  }
)
