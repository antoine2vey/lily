import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import {
  dissolve,
  leave,
  leaveForDeletion,
  settled,
} from '@lily/api/__tests__/integration/canopy-layers'
import { careDayOf } from '@lily/api/__tests__/integration/care-rows'
import { chatPermit } from '@lily/api/__tests__/mocks/care'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import { type Canopy, hashInviteToken } from '@lily/api/contexts/canopy'
import { CanopyWrite } from '@lily/api/contexts/canopy/domain/decide'
import { CanopyStore } from '@lily/api/contexts/canopy/store'
import { CarePlans, CareReadsLive } from '@lily/api/contexts/care'
import type { Outbox } from '@lily/api/kernel/outbox'
import {
  CanopyRepository,
  CanopyRepositoryLive,
} from '@lily/api/repositories/canopy.repository'
import {
  CarePlanRepository,
  CarePlanRepositoryLive,
} from '@lily/api/repositories/care-plan.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import {
  UserRepository,
  UserRepositoryLive,
} from '@lily/api/repositories/user.repository'
import type { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { acceptCanopyInvite } from '@lily/api/services/canopy/endpoints/accept-canopy-invite'
import { listPlantCarePlans } from '@lily/api/services/care-plans/endpoints/list-plant-care-plans'
import { withCarePlanAuth } from '@lily/api/services/care-plans/helpers/with-care-plan-auth'
import { withPlantKnowledge } from '@lily/api/services/plants/helpers/with-plant-access'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import {
  CANOPY_MAX_MEMBERS,
  CanopyFullError,
  CanopyId,
  UserNotFoundError,
} from '@lily/shared'
import { CarePlanNotFoundError } from '@lily/shared/errors/care-plan'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, DateTime, Effect, Exit, Layer } from 'effect'
import pg from 'pg'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
} from 'vitest'

const { Pool } = pg

const AppLive = Layer.mergeAll(
  CanopyRepositoryLive,
  CarePlanRepositoryLive,
  CareScheduleRepositoryLive,
  CareReadsLive,
  DelegationRepositoryLive,
  NotificationRepositoryLive,
  PlantRepositoryLive,
  UserRepositoryLive,
  createMockMessageQueue(),
  createMockEventBus(),
  createMockWeatherProvider(),
  createMockWeatherCache(),
  createMockWeatherRepository(),
  createMockLimitChecker()
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const run = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    Layer.Success<typeof AppLive> | Outbox | Canopy | CanopyStore | CarePlans
  >
) => Effect.runPromise(Effect.provide(settled(effect), AppLive))

const proposeRescue = (plantId: string, authorId: string) =>
  Effect.flatMap(CarePlans, (carePlans) =>
    carePlans.propose({
      permit: chatPermit(plantId, authorId),
      title: 'Rescue',
      source: 'ai',
      steps: [],
    })
  )

const plantValues = {
  name: 'Monstera',
  humidityRating: 3,
  lightingRating: 3,
  petToxicityRating: 1,
  wateringRating: 3,
}

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000)

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Canopy dissolve and leave - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let alexId: string
    let lilyId: string
    let samId: string
    let canopyId: string

    const insertPlant = async (
      values: Partial<typeof schema.plants.$inferInsert>
    ) => {
      const [plant] = await db
        .insert(schema.plants)
        .values({ ...plantValues, ...values })
        .returning()
      if (!plant) throw new Error('plant insert returned nothing')
      return plant
    }

    const join = (userId: string, role: 'owner' | 'member', joinedAt: string) =>
      db
        .insert(schema.canopyMembers)
        .values({ canopyId, userId, role, joinedAt: new Date(joinedAt) })

    const requestCount = async () =>
      (await db.select({ id: schema.outbox.id }).from(schema.outbox)).length

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    beforeEach(async () => {
      await db.execute(sql`TRUNCATE TABLE canopies RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      const stamp = Date.now()
      const users = await db
        .insert(schema.users)
        .values(
          Array.map(['Alex', 'Lily', 'Sam'], (name) => ({
            email: `${name}-${stamp}@example.com`,
            name,
            emailVerified: true,
          }))
        )
        .returning()
      const [alex, lily, sam] = users
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
    })

    afterAll(async () => {
      await db.execute(sql`TRUNCATE TABLE canopies RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      await pool.end()
    })

    it('moves every plant and room to the heir and leaves no Canopy row', async () => {
      await join(alexId, 'owner', '2024-01-01')
      await join(lilyId, 'member', '2024-02-01')
      const [ownRoom] = await db
        .insert(schema.rooms)
        .values({ name: 'Study', userId: alexId, order: 4 })
        .returning()
      const [canopyRoom] = await db
        .insert(schema.rooms)
        .values({ name: 'Kitchen', canopyId, order: 0 })
        .returning()
      const living = await insertPlant({
        canopyId,
        createdByUserId: null,
        roomId: canopyRoom?.id ?? null,
      })
      const dead = await insertPlant({
        canopyId,
        createdByUserId: alexId,
        diedAt: new Date('2026-01-01'),
      })
      const lilysOwn = await insertPlant({
        userId: lilyId,
        createdByUserId: lilyId,
      })
      const dueAt = inDays(3)
      await db.insert(schema.plantCareSchedules).values({
        plantId: living.id,
        careType: 'watering',
        frequencyDays: 7,
        nextCareAt: dueAt,
        dueDay: careDayOf(dueAt),
      })
      await db.insert(schema.notifications).values({
        userId: lilyId,
        plantId: living.id,
        type: 'watering_reminder',
        scheduledAt: inDays(3),
      })
      await db
        .insert(schema.canopyPlantMutes)
        .values({ userId: lilyId, plantId: living.id })
      await db.insert(schema.canopyInvites).values({
        canopyId,
        tokenHash: 'hash',
        createdByUserId: alexId,
        expiresAt: inDays(7),
      })

      await run(dissolve(alexId))

      const plants = await db
        .select()
        .from(schema.plants)
        .where(inArray(schema.plants.id, [living.id, dead.id, lilysOwn.id]))
      expect(
        Array.map(plants, (p) => [p.id, p.userId, p.canopyId, p.roomId])
      ).toEqual(
        expect.arrayContaining([
          [living.id, alexId, null, canopyRoom?.id],
          [dead.id, alexId, null, null],
          [lilysOwn.id, lilyId, null, null],
        ])
      )
      const [movedRoom] = await db
        .select()
        .from(schema.rooms)
        .where(eq(schema.rooms.id, canopyRoom?.id ?? ''))
      expect(movedRoom).toMatchObject({ userId: alexId, canopyId: null })
      expect(movedRoom?.order).toBeGreaterThan(ownRoom?.order ?? 0)

      const left = await Promise.all([
        db.select().from(schema.canopies),
        db.select().from(schema.canopyMembers),
        db.select().from(schema.canopyInvites),
        db.select().from(schema.canopyPlantMutes),
      ])
      expect(left).toEqual([[], [], [], []])

      const reminders = await db
        .select({ userId: schema.notifications.userId })
        .from(schema.notifications)
        .where(
          and(
            eq(schema.notifications.plantId, living.id),
            eq(schema.notifications.status, 'pending')
          )
        )
      expect(reminders).toEqual([{ userId: alexId }])
    })

    it('hands ownership by join date and drops only the leaver’s Canopy reminders', async () => {
      await join(alexId, 'owner', '2024-01-01')
      await join(lilyId, 'member', '2024-06-01')
      await join(samId, 'member', '2024-03-01')
      const fern = await insertPlant({ canopyId, createdByUserId: alexId })
      const alexsOwn = await insertPlant({
        userId: alexId,
        createdByUserId: alexId,
      })
      const dueAt = inDays(1)
      await db.insert(schema.plantCareSchedules).values({
        plantId: alexsOwn.id,
        careType: 'watering',
        frequencyDays: 7,
        nextCareAt: dueAt,
        dueDay: careDayOf(dueAt),
      })
      await db.insert(schema.notifications).values([
        {
          userId: alexId,
          plantId: fern.id,
          type: 'watering_reminder',
          scheduledAt: inDays(1),
        },
        {
          userId: alexId,
          plantId: alexsOwn.id,
          type: 'watering_reminder',
          scheduledAt: inDays(1),
        },
      ])

      const outcome = await run(leave(alexId))

      expect(outcome).toBe('left')
      const members = await db
        .select({
          userId: schema.canopyMembers.userId,
          role: schema.canopyMembers.role,
        })
        .from(schema.canopyMembers)
      expect(members).toEqual(
        expect.arrayContaining([
          { userId: samId, role: 'owner' },
          { userId: lilyId, role: 'member' },
        ])
      )
      expect(members).toHaveLength(2)
      const reminders = await db
        .select({ plantId: schema.notifications.plantId })
        .from(schema.notifications)
        .where(eq(schema.notifications.type, 'watering_reminder'))
      expect(reminders).toEqual([{ plantId: alexsOwn.id }])
      const pushes = await db
        .select({ userId: schema.notifications.userId })
        .from(schema.notifications)
        .where(eq(schema.notifications.type, 'canopy_member_left'))
      expect(pushes).toEqual([{ userId: samId }])
    })

    it('dissolves into the last member who leaves', async () => {
      await join(lilyId, 'owner', '2024-01-01')
      const fern = await insertPlant({ canopyId, createdByUserId: alexId })

      const outcome = await run(leave(lilyId))

      expect(outcome).toBe('dissolved')
      const [plant] = await db
        .select()
        .from(schema.plants)
        .where(eq(schema.plants.id, fern.id))
      expect(plant).toMatchObject({ userId: lilyId, canopyId: null })
      expect(await db.select().from(schema.canopies)).toEqual([])
    })

    it('hides a member’s care plans on Canopy plants once they leave', async () => {
      await join(alexId, 'owner', '2024-01-01')
      await join(lilyId, 'member', '2024-02-01')
      const fern = await insertPlant({ canopyId, createdByUserId: alexId })
      const asLily = <A, E>(
        effect: Effect.Effect<
          A,
          E,
          Layer.Success<typeof AppLive> | CurrentUser | Outbox
        >
      ) =>
        Effect.runPromiseExit(
          Effect.provide(
            settled(effect),
            Layer.merge(AppLive, createMockCurrentUser({ id: lilyId }))
          )
        )
      const lilysPlan = await run(proposeRescue(fern.id, lilyId))
      const plansOnFern = () =>
        asLily(
          withPlantKnowledge(fern.id, 'view').pipe(
            Effect.flatMap(({ view }) => listPlantCarePlans(fern.id, view)),
            Effect.map(({ items }) => Array.map(items, (p) => p.id))
          )
        )
      const lilysPlans = () =>
        run(
          Effect.flatMap(CarePlanRepository, (repo) => repo.findByUser(lilyId))
        )

      const before = await plansOnFern()
      expect(Exit.isSuccess(before) && before.value).toEqual([lilysPlan.planId])
      expect(await lilysPlans()).toHaveLength(1)

      await run(leave(lilyId))

      expect(failureOf(await plansOnFern())).toBeInstanceOf(PlantNotFoundError)
      expect(await lilysPlans()).toEqual([])
      expect(
        failureOf(await asLily(withCarePlanAuth(lilysPlan.planId, 'manage')))
      ).toBeInstanceOf(CarePlanNotFoundError)
      const kept = await db
        .select({ id: schema.carePlans.id })
        .from(schema.carePlans)
      expect(kept).toEqual([{ id: lilysPlan.planId }])
    })

    it("shows a caretaker's plan only while their delegation of the owner's plant is active", async () => {
      await join(alexId, 'owner', '2024-01-01')
      const fern = await insertPlant({
        userId: alexId,
        createdByUserId: alexId,
      })
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
        .values({ delegationId: delegation.id, plantId: fern.id })
      await run(proposeRescue(fern.id, lilyId))
      const lilysPlans = () =>
        run(
          Effect.flatMap(CarePlanRepository, (repo) => repo.findByUser(lilyId))
        )

      expect(await lilysPlans()).toHaveLength(1)

      await db
        .update(schema.plants)
        .set({ userId: null, canopyId })
        .where(eq(schema.plants.id, fern.id))
      expect(await lilysPlans()).toEqual([])

      await db
        .update(schema.plants)
        .set({ userId: alexId, canopyId: null })
        .where(eq(schema.plants.id, fern.id))
      await db
        .update(schema.careDelegations)
        .set({ status: 'completed', completedAt: inDays(0) })
        .where(eq(schema.careDelegations.id, delegation.id))
      expect(await lilysPlans()).toEqual([])
    })

    it('proposes a care plan even when its author can no longer reach the plant', async () => {
      const fern = await insertPlant({
        userId: alexId,
        createdByUserId: alexId,
      })

      const { planId } = await run(proposeRescue(fern.id, lilyId))

      expect(
        await run(
          Effect.flatMap(CarePlanRepository, (repo) => repo.findById(planId))
        )
      ).toMatchObject({ plantId: fern.id, title: 'Rescue' })
    })

    it('rolls the Canopy exit back when the account write after it fails', async () => {
      await join(alexId, 'owner', '2024-01-01')
      await join(lilyId, 'member', '2024-02-01')
      const fern = await insertPlant({ canopyId, createdByUserId: alexId })
      const requestsBefore = await requestCount()

      const exit = await Effect.runPromiseExit(
        Effect.provide(
          settled(
            leaveForDeletion(alexId)(Effect.fail(new UserNotFoundError()))
          ),
          AppLive
        )
      )

      expect(failureOf(exit)).toEqual(new UserNotFoundError())
      expect(await requestCount()).toBe(requestsBefore)
      const members = await db
        .select({
          userId: schema.canopyMembers.userId,
          role: schema.canopyMembers.role,
        })
        .from(schema.canopyMembers)
      expect(members).toEqual(
        expect.arrayContaining([
          { userId: alexId, role: 'owner' },
          { userId: lilyId, role: 'member' },
        ])
      )
      expect(members).toHaveLength(2)
      const [plant] = await db
        .select({ canopyId: schema.plants.canopyId })
        .from(schema.plants)
        .where(eq(schema.plants.id, fern.id))
      expect(plant?.canopyId).toBe(canopyId)
      expect(await db.select().from(schema.notifications)).toEqual([])
    })

    it('rolls the leave back when its notification insert fails', async () => {
      await join(alexId, 'owner', '2024-01-01')
      await join(lilyId, 'member', '2024-02-01')
      await db.execute(
        sql.raw(`
          CREATE FUNCTION refuse_notification_for() RETURNS trigger AS $$
          BEGIN
            IF NEW.user_id::text = TG_ARGV[0] THEN
              RAISE EXCEPTION 'notification refused';
            END IF;
            RETURN NEW;
          END $$ LANGUAGE plpgsql;
          CREATE TRIGGER refuse_notification BEFORE INSERT ON notifications
            FOR EACH ROW EXECUTE FUNCTION refuse_notification_for('${alexId}');
        `)
      )
      onTestFinished(async () => {
        await db.execute(
          sql.raw(`
            DROP TRIGGER refuse_notification ON notifications;
            DROP FUNCTION refuse_notification_for();
          `)
        )
      })

      const requestsBefore = await requestCount()

      const exit = await Effect.runPromiseExit(
        Effect.provide(settled(leave(lilyId)), AppLive)
      )

      expect(Exit.isFailure(exit)).toBe(true)
      expect(await requestCount()).toBe(requestsBefore)
      const members = await db
        .select({ userId: schema.canopyMembers.userId })
        .from(schema.canopyMembers)
      expect(members).toEqual(
        expect.arrayContaining([{ userId: alexId }, { userId: lilyId }])
      )
      expect(members).toHaveLength(2)
      expect(await db.select().from(schema.notifications)).toEqual([])
    })

    it('keeps one live invite per Canopy across replacements', async () => {
      await join(alexId, 'owner', '2024-01-01')
      const replace = (tokenHash: string) =>
        run(
          Effect.flatMap(CanopyStore, (store) =>
            store.apply([
              CanopyWrite.ReplaceLink({
                canopyId: CanopyId.make(canopyId),
                tokenHash,
                createdBy: alexId,
                expiresAt: DateTime.makeUnsafe(inDays(7)),
                at: DateTime.nowUnsafe(),
              }),
            ])
          )
        )

      await replace('first')
      await replace('second')

      const invites = await db
        .select({
          tokenHash: schema.canopyInvites.tokenHash,
          revoked: sql<boolean>`${schema.canopyInvites.revokedAt} IS NOT NULL`,
        })
        .from(schema.canopyInvites)
      expect(invites).toEqual(
        expect.arrayContaining([
          { tokenHash: 'first', revoked: true },
          { tokenHash: 'second', revoked: false },
        ])
      )
      const preview = await run(
        Effect.flatMap(CanopyRepository, (repo) =>
          repo.findInviteByTokenHash('second')
        )
      )
      expect(preview).toMatchObject({
        canopyName: 'Home',
        inviterName: 'Alex',
        memberCount: 1,
        revokedAt: null,
      })
    })

    it("deletes a sole member's Canopy plants and rooms with the account", async () => {
      await join(lilyId, 'owner', '2024-01-01')
      const fern = await insertPlant({ canopyId, createdByUserId: lilyId })
      const alexsFern = await insertPlant({
        userId: alexId,
        createdByUserId: alexId,
      })
      await db.insert(schema.rooms).values({ name: 'Kitchen', canopyId })

      await run(
        leaveForDeletion(lilyId)(
          Effect.flatMap(UserRepository, (repo) => repo.delete(lilyId))
        )
      )

      const plants = await db
        .select({ id: schema.plants.id })
        .from(schema.plants)
        .where(inArray(schema.plants.id, [fern.id, alexsFern.id]))
      expect(plants).toEqual([{ id: alexsFern.id }])
      expect(
        await db
          .select()
          .from(schema.rooms)
          .where(eq(schema.rooms.name, 'Kitchen'))
      ).toEqual([])
      expect(await db.select().from(schema.canopies)).toEqual([])
    })

    it('dissolves exactly once when the last two members leave at the same time', async () => {
      await join(alexId, 'owner', '2024-01-01')
      await join(lilyId, 'member', '2024-02-01')
      const fern = await insertPlant({ canopyId, createdByUserId: null })

      const outcomes = await Promise.all([
        run(leave(alexId)),
        run(leave(lilyId)),
      ])

      expect([...outcomes].sort()).toEqual(['dissolved', 'left'])
      const [plant] = await db
        .select()
        .from(schema.plants)
        .where(eq(schema.plants.id, fern.id))
      const dissolvedBy = outcomes[0] === 'dissolved' ? alexId : lilyId
      expect(plant).toMatchObject({ canopyId: null, userId: dissolvedBy })
      expect(await db.select().from(schema.canopies)).toEqual([])
      expect(await db.select().from(schema.canopyMembers)).toEqual([])
    })

    it('admits one of two users racing for the last seat', async () => {
      await join(alexId, 'owner', '2024-01-01')
      const fillers = await db
        .insert(schema.users)
        .values(
          Array.map(Array.range(1, CANOPY_MAX_MEMBERS - 1), (n) => ({
            email: `fill-${n}-${Date.now()}@example.com`,
            emailVerified: true,
          }))
        )
        .returning({ id: schema.users.id })
      await db.insert(schema.canopyMembers).values(
        Array.map(Array.take(fillers, CANOPY_MAX_MEMBERS - 2), (u) => ({
          canopyId,
          userId: u.id,
        }))
      )
      const token = 'last-seat'
      await db.insert(schema.canopyInvites).values({
        canopyId,
        tokenHash: hashInviteToken(token),
        createdByUserId: alexId,
        expiresAt: inDays(7),
      })
      const accept = (userId: string) =>
        Effect.runPromiseExit(
          acceptCanopyInvite(token).pipe(
            settled,
            Effect.provide(
              Layer.merge(AppLive, createMockCurrentUser({ id: userId }))
            )
          )
        )

      const exits = await Promise.all([accept(lilyId), accept(samId)])

      expect(Array.filter(exits, Exit.isSuccess)).toHaveLength(1)
      expect(Array.map(Array.filter(exits, Exit.isFailure), failureOf)).toEqual(
        [new CanopyFullError({ limit: CANOPY_MAX_MEMBERS })]
      )
      const [members] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.canopyMembers)
        .where(eq(schema.canopyMembers.canopyId, canopyId))
      expect(members?.count).toBe(CANOPY_MAX_MEMBERS)
    })
  }
)
