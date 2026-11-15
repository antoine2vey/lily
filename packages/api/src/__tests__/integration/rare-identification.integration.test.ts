import { createMockAiService } from '@lily/api/__tests__/mocks/ai.service'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { MockUsageTrackerLive } from '@lily/api/__tests__/mocks/usage-tracker'
import type { AppEvent } from '@lily/api/events'
import {
  AchievementRepository,
  AchievementRepositoryLive,
} from '@lily/api/repositories/achievement.repository'
import {
  RareIdentificationRepository,
  RareIdentificationRepositoryLive,
} from '@lily/api/repositories/rare-identification.repository'
import { processEvent } from '@lily/api/services/achievements/checker'
import { AchievementNotifier } from '@lily/api/services/achievements/notifier'
import { aiReIdentify } from '@lily/api/services/plants/endpoints/ai-re-identify'
import {
  awardRareIdentification,
  rememberRareIdentification,
} from '@lily/api/services/plants/helpers/rare-identification'
import { DrizzleLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, ConfigProvider, Effect, Layer } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Rare Collector from the identification answer - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let collectorId: string
    let strangerId: string
    let holderId: string
    let changerId: string

    const imageUrl = `https://storage.googleapis.com/lily/identify/${Date.now()}.jpg`

    const ReposLive = Layer.mergeAll(
      RareIdentificationRepositoryLive,
      AchievementRepositoryLive
    ).pipe(
      Layer.provide(DrizzleLive),
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            DATABASE_URL: process.env.DATABASE_URL_TEST,
          })
        )
      )
    )

    const MockAchievementNotifier = Layer.succeed(AchievementNotifier, {
      notify: () => Effect.void,
      subscribe: Effect.die('subscribe not implemented in tests'),
    })

    const as = (userId: string, publishedEvents: AppEvent[] = []) =>
      Layer.mergeAll(
        ReposLive,
        MockAchievementNotifier,
        createMockCurrentUser({ id: userId }),
        createMockEventBus({ publishedEvents })
      )

    const saveAndProcess = (userId: string, url: string | undefined) => {
      const publishedEvents: AppEvent[] = []
      return Effect.gen(function* () {
        yield* awardRareIdentification('plant-1', url)
        yield* Effect.forEach(publishedEvents, processEvent, { discard: true })
        const repo = yield* AchievementRepository
        return yield* repo.findByUserId(userId)
      }).pipe(Effect.provide(as(userId, publishedEvents)), Effect.runPromise)
    }

    const reIdentify = (
      userId: string,
      url: string,
      isRareHouseplant: boolean
    ) =>
      aiReIdentify([url], 'en').pipe(
        Effect.provide(
          Layer.mergeAll(
            as(userId),
            createMockAiService({ isRareHouseplant }),
            MockUsageTrackerLive
          )
        ),
        Effect.runPromise
      )

    const storedRows = (userId: string, url: string) =>
      db
        .select({ id: schema.rarePlantIdentifications.id })
        .from(schema.rarePlantIdentifications)
        .where(
          and(
            eq(schema.rarePlantIdentifications.userId, userId),
            eq(schema.rarePlantIdentifications.imageUrl, url)
          )
        )

    const hasRareCollector = (rows: { readonly achievement: string }[]) =>
      Array.some(rows, (row) => row.achievement === 'RARE_COLLECTOR')

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      const stamp = Date.now()
      const users = await db
        .insert(schema.users)
        .values(
          ['collector', 'stranger', 'holder', 'changer'].map((role) => ({
            email: `rare-${role}-${stamp}@example.com`,
            name: `rare_${role}_${stamp}`,
            emailVerified: true,
          }))
        )
        .returning()
      collectorId = users[0]!.id
      strangerId = users[1]!.id
      holderId = users[2]!.id
      changerId = users[3]!.id
    })

    afterAll(async () => {
      await db
        .delete(schema.users)
        .where(
          inArray(schema.users.id, [
            collectorId,
            strangerId,
            holderId,
            changerId,
          ])
        )
      await pool.end()
    })

    it('stores a rare answer for the identifying user and that exact photo', async () => {
      await rememberRareIdentification({
        isRareHouseplant: true,
        imageUrl,
      }).pipe(Effect.provide(as(collectorId)), Effect.runPromise)

      const lookups = await Effect.gen(function* () {
        const repo = yield* RareIdentificationRepository
        return yield* Effect.all([
          repo.exists({ userId: collectorId, imageUrl }),
          repo.exists({ userId: strangerId, imageUrl }),
          repo.exists({ userId: collectorId, imageUrl: `${imageUrl}?v=2` }),
        ])
      }).pipe(Effect.provide(ReposLive), Effect.runPromise)

      expect(lookups).toEqual([true, false, false])
    })

    it('does not store an answer that was not rare', async () => {
      const notRareUrl = `${imageUrl}-pothos`
      await rememberRareIdentification({
        isRareHouseplant: false,
        imageUrl: notRareUrl,
      }).pipe(Effect.provide(as(collectorId)), Effect.runPromise)

      const stored = await Effect.gen(function* () {
        const repo = yield* RareIdentificationRepository
        return yield* repo.exists({ userId: collectorId, imageUrl: notRareUrl })
      }).pipe(Effect.provide(ReposLive), Effect.runPromise)

      expect(stored).toBe(false)
    })

    it('keeps one row when the same photo is identified as rare again', async () => {
      const url = `${imageUrl}-repeat`

      await reIdentify(collectorId, url, true)
      await reIdentify(collectorId, url, true)
      await reIdentify(collectorId, url, true)

      expect(await storedRows(collectorId, url)).toHaveLength(1)
    })

    it('records the same rare photo twice without an error', async () => {
      const identification = {
        userId: collectorId,
        imageUrl: `${imageUrl}-recorded-twice`,
      }

      await Effect.gen(function* () {
        const repo = yield* RareIdentificationRepository
        yield* repo.record(identification)
        yield* repo.record(identification)
      }).pipe(Effect.provide(ReposLive), Effect.runPromise)

      expect(
        await storedRows(identification.userId, identification.imageUrl)
      ).toHaveLength(1)
    })

    it('lets a later answer that is not rare win for the same photo', async () => {
      const url = `${imageUrl}-changed-mind`

      await reIdentify(changerId, url, true)
      await reIdentify(changerId, url, false)
      const achievements = await saveAndProcess(changerId, url)

      expect({
        rows: await storedRows(changerId, url),
        rareCollector: hasRareCollector(achievements),
      }).toEqual({ rows: [], rareCollector: false })
    })

    it('does not unlock for a user who saves a photo someone else identified as rare', async () => {
      const achievements = await saveAndProcess(strangerId, imageUrl)

      expect(hasRareCollector(achievements)).toBe(false)
    })

    it('unlocks Rare Collector when the identifying user saves the plant', async () => {
      const achievements = await saveAndProcess(collectorId, imageUrl)

      expect(hasRareCollector(achievements)).toBe(true)
    })

    it('still reads a Rare Collector row written before this change', async () => {
      const unlockedAt = new Date('2026-01-15T09:00:00.000Z')
      await db
        .insert(schema.userAchievements)
        .values({ userId: holderId, achievement: 'RARE_COLLECTOR', unlockedAt })

      const achievements = await Effect.gen(function* () {
        const repo = yield* AchievementRepository
        return yield* repo.findByUserId(holderId)
      }).pipe(Effect.provide(ReposLive), Effect.runPromise)

      expect(achievements).toEqual([
        expect.objectContaining({
          userId: holderId,
          achievement: 'RARE_COLLECTOR',
          unlockedAt,
        }),
      ])
    })
  }
)
