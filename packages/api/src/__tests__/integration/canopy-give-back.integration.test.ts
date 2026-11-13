import { settled } from '@lily/api/__tests__/integration/care-layers'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { CareReadsLive } from '@lily/api/contexts/care'
import type { Outbox } from '@lily/api/kernel/outbox'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { deleteMyCanopy } from '@lily/api/services/canopy/endpoints/delete-my-canopy'
import { removeCanopyMember } from '@lily/api/services/canopy/endpoints/remove-canopy-member'
import {
  leaveCanopy,
  leaveCanopyAndDelete,
} from '@lily/api/services/canopy/helpers/leave-canopy'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, Effect, Layer } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const ReposLive = Layer.mergeAll(
  CanopyRepositoryLive,
  CareScheduleRepositoryLive,
  CareReadsLive,
  DelegationRepositoryLive,
  NotificationRepositoryLive,
  PlantRepositoryLive,
  UserRepositoryLive,
  createMockMessageQueue(),
  createMockEventBus()
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const as = (userId: string) =>
  Layer.mergeAll(ReposLive, createMockCurrentUser({ id: userId }))

const run = <A, E>(
  userId: string,
  effect: Effect.Effect<A, E, Layer.Success<ReturnType<typeof as>> | Outbox>
) => Effect.runPromise(Effect.provide(settled(effect), as(userId)))

const plantValues = {
  name: 'Monstera',
  humidityRating: 3,
  lightingRating: 3,
  petToxicityRating: 1,
  wateringRating: 3,
}

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000)

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Canopy give-back - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let alexId: string
    let lilyId: string
    let samId: string
    let goneId: string
    let canopyId: string
    let kitchenId: string
    /** Lily's six live shared plants, then her dead one. */
    let lilys: string[]
    let samsFern: string
    let alexsPalm: string
    let orphan: string
    let exMembers: string

    const insertPlant = async (
      values: Partial<typeof schema.plants.$inferInsert>
    ) => {
      const [plant] = await db
        .insert(schema.plants)
        .values({ ...plantValues, ...values })
        .returning()
      if (!plant) throw new Error('plant insert returned nothing')
      return plant.id
    }

    const shared = (createdByUserId: string | null, diedAt?: Date) =>
      insertPlant({
        canopyId,
        createdByUserId,
        roomId: kitchenId,
        diedAt: diedAt ?? null,
      })

    const remindOf = (userId: string, plantId: string) => ({
      userId,
      plantId,
      type: 'watering_reminder' as const,
      scheduledAt: inDays(3),
    })

    const plantsOf = async (ids: ReadonlyArray<string>) =>
      Array.map(
        await db
          .select()
          .from(schema.plants)
          .where(inArray(schema.plants.id, [...ids])),
        (p) => ({
          id: p.id,
          userId: p.userId,
          canopyId: p.canopyId,
          roomId: p.roomId,
        })
      )

    const personalTo = (userId: string, ids: ReadonlyArray<string>) =>
      Array.map(ids, (id) => ({ id, userId, canopyId: null, roomId: null }))

    const stillShared = (ids: ReadonlyArray<string>) =>
      Array.map(ids, (id) => ({
        id,
        userId: null,
        canopyId,
        roomId: kitchenId,
      }))

    const remindersOn = async (ids: ReadonlyArray<string>) =>
      Array.map(
        await db
          .select({
            userId: schema.notifications.userId,
            plantId: schema.notifications.plantId,
          })
          .from(schema.notifications)
          .where(
            and(
              inArray(schema.notifications.plantId, [...ids]),
              eq(schema.notifications.status, 'pending'),
              eq(schema.notifications.type, 'watering_reminder')
            )
          ),
        (r) => `${r.userId}:${r.plantId}`
      ).sort()

    const mutes = async () =>
      Array.map(
        await db.select().from(schema.canopyPlantMutes),
        (m) => `${m.userId}:${m.plantId}`
      ).sort()

    const plantCount = async (userId: string) =>
      (
        await db
          .select({ id: schema.plants.id })
          .from(schema.plants)
          .where(eq(schema.plants.userId, userId))
      ).length

    const holders = (userId: string, ids: ReadonlyArray<string>) =>
      Array.map(ids, (id) => `${userId}:${id}`)

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    /**
     * Alex owns the Canopy; Sam and Lily are members; Gone shared a plant and
     * left. Lily, on the free plan, shared six live plants and a dead one.
     * Each Canopy plant has a future schedule and one member's reminder.
     */
    beforeEach(async () => {
      await db.execute(sql`TRUNCATE TABLE canopies RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      const stamp = Date.now()
      const users = await db
        .insert(schema.users)
        .values(
          Array.map(['Alex', 'Lily', 'Sam', 'Gone'], (name) => ({
            email: `${name}-${stamp}@example.com`,
            name,
            emailVerified: true,
          }))
        )
        .returning()
      const [alex, lily, sam, gone] = users
      if (!alex || !lily || !sam || !gone)
        throw new Error('user insert returned nothing')
      alexId = alex.id
      lilyId = lily.id
      samId = sam.id
      goneId = gone.id
      const [canopy] = await db
        .insert(schema.canopies)
        .values({ name: 'Home' })
        .returning()
      if (!canopy) throw new Error('canopy insert returned nothing')
      canopyId = canopy.id
      await db.insert(schema.canopyMembers).values([
        {
          canopyId,
          userId: alexId,
          role: 'owner',
          joinedAt: new Date('2024-01-01'),
        },
        {
          canopyId,
          userId: samId,
          role: 'member',
          joinedAt: new Date('2024-03-01'),
        },
        {
          canopyId,
          userId: lilyId,
          role: 'member',
          joinedAt: new Date('2024-06-01'),
        },
      ])
      const [kitchen] = await db
        .insert(schema.rooms)
        .values({ name: 'Kitchen', canopyId, order: 0 })
        .returning()
      if (!kitchen) throw new Error('room insert returned nothing')
      kitchenId = kitchen.id

      lilys = [
        ...(await Promise.all(Array.makeBy(6, () => shared(lilyId)))),
        await shared(lilyId, new Date('2026-01-01')),
      ]
      samsFern = await shared(samId)
      alexsPalm = await shared(alexId)
      orphan = await shared(null)
      exMembers = await shared(goneId)
      await insertPlant({ userId: lilyId, createdByUserId: lilyId })

      const canopyPlants = [...lilys, samsFern, alexsPalm, orphan, exMembers]
      await db.insert(schema.plantCareSchedules).values(
        Array.map(canopyPlants, (plantId) => ({
          plantId,
          careType: 'watering' as const,
          frequencyDays: 7,
          nextCareAt: inDays(3),
        }))
      )
      await db
        .insert(schema.notifications)
        .values([
          ...Array.flatMap(lilys, (id) => [
            remindOf(alexId, id),
            remindOf(samId, id),
          ]),
          remindOf(samId, samsFern),
          remindOf(alexId, alexsPalm),
          remindOf(alexId, orphan),
          remindOf(alexId, exMembers),
        ])
      await db.insert(schema.canopyPlantMutes).values([
        { userId: samId, plantId: lilys[0] ?? '' },
        { userId: alexId, plantId: lilys[6] ?? '' },
        { userId: alexId, plantId: samsFern },
        { userId: samId, plantId: alexsPalm },
      ])
    })

    afterAll(async () => {
      await db.execute(sql`TRUNCATE TABLE canopies RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      await pool.end()
    })

    const expectLilysReturned = async () => {
      expect(await plantsOf(lilys)).toEqual(
        expect.arrayContaining(personalTo(lilyId, lilys))
      )
      expect(await remindersOn(lilys)).toEqual(
        holders(lilyId, lilys.slice(0, 6)).sort()
      )
      expect(await plantCount(lilyId)).toBe(8)
      const others = [samsFern, alexsPalm, orphan, exMembers]
      expect(await plantsOf(others)).toEqual(
        expect.arrayContaining(stillShared(others))
      )
      expect(await remindersOn(others)).toEqual(
        [
          `${samId}:${samsFern}`,
          `${alexId}:${alexsPalm}`,
          `${alexId}:${orphan}`,
          `${alexId}:${exMembers}`,
        ].sort()
      )
      expect(await mutes()).toEqual(
        [`${alexId}:${samsFern}`, `${samId}:${alexsPalm}`].sort()
      )
    }

    it("gives a leaving free member every plant they shared, past the plan's limit", async () => {
      const outcome = await run(lilyId, leaveCanopy(lilyId))

      expect(outcome._tag).toBe('Left')
      await expectLilysReturned()
    })

    it('gives a removed member every plant they shared', async () => {
      await run(alexId, removeCanopyMember(lilyId))

      const members = await db
        .select({ userId: schema.canopyMembers.userId })
        .from(schema.canopyMembers)
      expect(Array.map(members, (m) => m.userId).sort()).toEqual(
        [alexId, samId].sort()
      )
      await expectLilysReturned()
    })

    it('gives a leaving owner their plants and passes ownership', async () => {
      await run(alexId, leaveCanopy(alexId))

      const [owner] = await db
        .select({ userId: schema.canopyMembers.userId })
        .from(schema.canopyMembers)
        .where(eq(schema.canopyMembers.role, 'owner'))
      expect(owner?.userId).toBe(samId)
      expect(await plantsOf([alexsPalm])).toEqual(
        personalTo(alexId, [alexsPalm])
      )
      expect(await remindersOn([alexsPalm])).toEqual([`${alexId}:${alexsPalm}`])
      const stay = [...lilys, samsFern, orphan, exMembers]
      expect(await plantsOf(stay)).toEqual(
        expect.arrayContaining(stillShared(stay))
      )
      expect(await mutes()).toEqual([`${samId}:${lilys[0]}`])
    })

    it('splits a deleted Canopy between the sharers and gives the rest and the rooms to the owner', async () => {
      await run(alexId, deleteMyCanopy())

      expect(await db.select().from(schema.canopies)).toEqual([])
      expect(await plantsOf(lilys)).toEqual(
        expect.arrayContaining(personalTo(lilyId, lilys))
      )
      expect(await plantsOf([samsFern])).toEqual(personalTo(samId, [samsFern]))
      expect(await plantsOf([alexsPalm, orphan, exMembers])).toEqual(
        expect.arrayContaining(
          Array.map([alexsPalm, orphan, exMembers], (id) => ({
            id,
            userId: alexId,
            canopyId: null,
            roomId: kitchenId,
          }))
        )
      )
      const [kitchen] = await db
        .select()
        .from(schema.rooms)
        .where(eq(schema.rooms.id, kitchenId))
      expect(kitchen).toMatchObject({ userId: alexId, canopyId: null })
      expect(await mutes()).toEqual([])
      expect(await remindersOn(lilys)).toEqual(
        holders(lilyId, lilys.slice(0, 6)).sort()
      )
      expect(
        await remindersOn([samsFern, alexsPalm, orphan, exMembers])
      ).toEqual(
        [
          `${samId}:${samsFern}`,
          ...holders(alexId, [alexsPalm, orphan, exMembers]),
        ].sort()
      )
      expect(await plantCount(lilyId)).toBe(8)
    })

    it('leaves the plants of a member who deletes their account in the Canopy', async () => {
      await run(lilyId, leaveCanopyAndDelete(lilyId)(Effect.void))

      expect(await plantsOf(lilys)).toEqual(
        expect.arrayContaining(stillShared(lilys))
      )
      const returned = await db
        .select({ id: schema.plants.id })
        .from(schema.plants)
        .where(
          and(inArray(schema.plants.id, lilys), isNotNull(schema.plants.userId))
        )
      expect(returned).toEqual([])
    })
  }
)
