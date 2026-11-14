import {
  ChatRepository,
  ChatRepositoryLive,
} from '@lily/api/repositories/chat.repository'
import {
  ChatFollowUpRepository,
  ChatFollowUpRepositoryLive,
} from '@lily/api/repositories/chat-follow-up.repository'
import {
  type FollowUp,
  lifecycleOf,
} from '@lily/api/services/ai-chat/follow-up-set'
import { PgLive } from '@lily/db'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import * as schema from '@lily/db/schema'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import {
  Array,
  ConfigProvider,
  DateTime,
  Effect,
  Layer,
  ManagedRuntime,
  Option,
} from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const MINUTE = 60 * 1000
const now = new Date('2026-11-14T12:00:00Z')
const minutesFromNow = (minutes: number) =>
  new Date(now.getTime() + minutes * MINUTE)

const written: ReadonlyArray<FollowUp> = [
  {
    id: '0:none',
    text: 'How much light does it need?',
    basis: { kind: 'none' },
  },
  {
    id: '1:late:watering',
    text: 'Should I water it today?',
    basis: { kind: 'late', careType: 'watering' },
  },
]

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'chat follow-up sets - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let runtime: ManagedRuntime.ManagedRuntime<
      ChatFollowUpRepository | ChatRepository,
      unknown
    >
    let userId: string
    let plantIds: ReadonlyArray<string>

    const followUps = <A>(
      use: (
        repo: ChatFollowUpRepository['Service']
      ) => Effect.Effect<A, unknown>
    ) => runtime.runPromise(Effect.flatMap(ChatFollowUpRepository, use))

    const setOf = async (plantId: string) =>
      Option.getOrThrow(await followUps((repo) => repo.find(userId, plantId)))

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })

      const [user] = await db
        .insert(schema.users)
        .values({
          email: `follow-ups-${Date.now()}-${Math.random()}@example.com`,
          name: 'follow-ups',
          emailVerified: true,
          role: 'user',
          status: 'active',
        })
        .returning()
      if (!user) throw new Error('DB insertion failed.')
      userId = user.id

      const plants = await db
        .insert(schema.plants)
        .values(
          Array.makeBy(4, (n) => ({
            name: `follow-up plant ${n}`,
            humidityRating: 3,
            lightingRating: 3,
            petToxicityRating: 1,
            wateringRating: 3,
            userId,
            createdByUserId: userId,
          }))
        )
        .returning()
      plantIds = Array.map(plants, (plant) => plant.id)

      const ConfigLive = ConfigProvider.layer(
        ConfigProvider.fromUnknown({
          DATABASE_URL: process.env.DATABASE_URL_TEST,
        })
      )
      runtime = ManagedRuntime.make(
        Layer.mergeAll(ChatFollowUpRepositoryLive, ChatRepositoryLive).pipe(
          Layer.provide(
            PgDrizzle.layer.pipe(
              Layer.provideMerge(PgLive.pipe(Layer.provide(ConfigLive)))
            )
          )
        )
      )
    })

    beforeEach(async () => {
      await db
        .delete(schema.chatFollowUpSets)
        .where(eq(schema.chatFollowUpSets.userId, userId))
    })

    afterAll(async () => {
      await db.delete(schema.users).where(eq(schema.users.id, userId))
      await runtime.dispose()
      await pool.end()
    })

    it('opens a request once and leaves an open request as it is', async () => {
      const [fern] = plantIds
      await followUps((repo) =>
        repo.request({ userId, plantIds: [fern!], language: 'en', at: now })
      )
      await followUps((repo) =>
        repo.request({
          userId,
          plantIds: [fern!],
          language: 'fr',
          at: minutesFromNow(5),
        })
      )

      expect(await setOf(fern!)).toEqual({
        userId,
        plantId: fern,
        language: 'en',
        requestedAt: now,
        claimedUntil: null,
        generatedAt: null,
        followUps: [],
      })
    })

    it('claims exactly the requested sets, the oldest request first, and holds them', async () => {
      const [idle, waiting, abandoned, held] = plantIds
      await db.insert(schema.chatFollowUpSets).values([
        { userId, plantId: idle!, language: 'en', generatedAt: now },
        {
          userId,
          plantId: waiting!,
          language: 'en',
          requestedAt: minutesFromNow(-1),
        },
        {
          userId,
          plantId: abandoned!,
          language: 'en',
          requestedAt: minutesFromNow(-30),
          claimedUntil: minutesFromNow(-20),
        },
        {
          userId,
          plantId: held!,
          language: 'en',
          requestedAt: minutesFromNow(-2),
          claimedUntil: minutesFromNow(2),
        },
      ])
      const before = await followUps((repo) => repo.findByUser(userId))
      const requested = Array.filter(
        before,
        (set) => lifecycleOf(set, DateTime.fromDateUnsafe(now)) === 'requested'
      )

      const claim = async (limit: number) =>
        Array.filter(
          await followUps((repo) =>
            repo.claim({ limit, at: now, until: minutesFromNow(3) })
          ),
          (set) => set.userId === userId
        )
      const first = await claim(1)
      const second = await claim(10)
      const third = await claim(10)

      expect(Array.map(first, (set) => set.plantId)).toEqual([abandoned])
      expect(Array.map(second, (set) => set.plantId)).toEqual([waiting])
      expect(third).toEqual([])
      expect(Array.map(requested, (set) => set.plantId).sort()).toEqual(
        [abandoned, waiting].sort()
      )
      expect(
        Array.map([...first, ...second], (set) =>
          lifecycleOf(set, DateTime.fromDateUnsafe(now))
        )
      ).toEqual(['claimed', 'claimed'])
    })

    it('stores a set and closes its request', async () => {
      const [fern] = plantIds
      await followUps((repo) =>
        repo.request({ userId, plantIds: [fern!], language: 'en', at: now })
      )
      await followUps((repo) =>
        repo.claim({ limit: 10, at: now, until: minutesFromNow(3) })
      )
      await followUps((repo) =>
        repo.store({
          userId,
          plantId: fern!,
          followUps: written,
          at: minutesFromNow(1),
        })
      )

      expect(await setOf(fern!)).toEqual({
        userId,
        plantId: fern,
        language: 'en',
        requestedAt: null,
        claimedUntil: null,
        generatedAt: minutesFromNow(1),
        followUps: written,
      })
    })

    it('keeps the stored follow-ups when a request is released', async () => {
      const [fern] = plantIds
      await db.insert(schema.chatFollowUpSets).values({
        userId,
        plantId: fern!,
        language: 'en',
        generatedAt: minutesFromNow(-3000),
        followUps: written,
      })
      await followUps((repo) =>
        repo.request({ userId, plantIds: [fern!], language: 'en', at: now })
      )
      await followUps((repo) => repo.release({ userId, plantId: fern! }))

      expect(await setOf(fern!)).toMatchObject({
        requestedAt: null,
        claimedUntil: null,
        generatedAt: minutesFromNow(-3000),
        followUps: written,
      })
    })

    it('empties the follow-ups of a set requested in another language', async () => {
      const [fern] = plantIds
      await db.insert(schema.chatFollowUpSets).values({
        userId,
        plantId: fern!,
        language: 'en',
        generatedAt: minutesFromNow(-3000),
        followUps: written,
      })
      await followUps((repo) =>
        repo.request({ userId, plantIds: [fern!], language: 'fr', at: now })
      )

      expect(await setOf(fern!)).toMatchObject({
        language: 'fr',
        requestedAt: now,
        followUps: [],
      })
    })

    it('reads a set of an unknown shape as empty', async () => {
      const [fern] = plantIds
      await db.insert(schema.chatFollowUpSets).values({
        userId,
        plantId: fern!,
        language: 'en',
        generatedAt: now,
        followUps: [{ id: 'old', text: 'Old shape', basis: 'late:watering' }],
      })

      expect((await setOf(fern!)).followUps).toEqual([])
    })

    it('reads the plants the user wrote about, their latest questions and what was sent since', async () => {
      const [asked, onlyAnswered] = plantIds
      const conversations = await db
        .insert(schema.chatConversations)
        .values([
          { userId, kind: 'plant', plantId: asked! },
          { userId, kind: 'plant', plantId: onlyAnswered! },
          { userId, kind: 'general' },
        ])
        .returning()
      const [askedChat, answeredChat, generalChat] = conversations
      await db.insert(schema.chatMessages).values([
        {
          role: 'user',
          content: 'first question',
          userId,
          conversationId: askedChat!.id,
          createdAt: minutesFromNow(-10),
        },
        {
          role: 'user',
          content: 'second question',
          userId,
          conversationId: askedChat!.id,
          createdAt: minutesFromNow(-5),
        },
        {
          role: 'assistant',
          content: 'an answer',
          userId,
          conversationId: askedChat!.id,
          createdAt: minutesFromNow(-1),
        },
        {
          role: 'assistant',
          content: 'an answer nobody asked for',
          userId,
          conversationId: answeredChat!.id,
          createdAt: now,
        },
        {
          role: 'user',
          content: 'a general question',
          userId,
          conversationId: generalChat!.id,
          createdAt: now,
        },
      ])

      const found = await runtime.runPromise(
        Effect.flatMap(ChatRepository, (repo) => repo.findAskedPlants(userId))
      )

      expect(found).toEqual([
        { plantId: asked, lastAskedAt: minutesFromNow(-5) },
      ])

      const questions = (plantId: string, limit: number) =>
        runtime.runPromise(
          Effect.flatMap(ChatRepository, (repo) =>
            repo.findRecentQuestions({ userId, plantId, limit })
          )
        )
      expect(await questions(asked!, 12)).toEqual([
        'second question',
        'first question',
      ])
      expect(await questions(asked!, 1)).toEqual(['second question'])
      expect(await questions(onlyAnswered!, 12)).toEqual([])

      const sentSince = (since: Date, texts: ReadonlyArray<string>) =>
        runtime.runPromise(
          Effect.flatMap(ChatRepository, (repo) =>
            repo.findSentTexts({ userId, plantId: asked!, since, texts })
          )
        )
      const candidates = [
        'first question',
        'second question',
        'an answer',
        'a general question',
        'never sent',
      ]
      expect(await sentSince(minutesFromNow(-7), candidates)).toEqual([
        'second question',
      ])
      expect(
        [...(await sentSince(minutesFromNow(-60), candidates))].sort()
      ).toEqual(['first question', 'second question'])
      expect(await sentSince(minutesFromNow(-60), [])).toEqual([])
    })
  }
)
