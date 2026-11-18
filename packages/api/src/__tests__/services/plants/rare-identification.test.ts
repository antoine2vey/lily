import { createMockAchievementRepository } from '@lily/api/__tests__/mocks/achievement.repository'
import { createMockAiService } from '@lily/api/__tests__/mocks/ai.service'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockFileService } from '@lily/api/__tests__/mocks/file.service'
import { createMockFileSystem } from '@lily/api/__tests__/mocks/file-system'
import { createMockGCSService } from '@lily/api/__tests__/mocks/gcs.service'
import { MockLimitCheckerLive } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockRareIdentificationRepository } from '@lily/api/__tests__/mocks/rare-identification.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { MockUsageTrackerLive } from '@lily/api/__tests__/mocks/usage-tracker'
import type { AppEvent } from '@lily/api/events'
import { AchievementRepository } from '@lily/api/repositories/achievement.repository'
import {
  type RareIdentification,
  RareIdentificationRepository,
} from '@lily/api/repositories/rare-identification.repository'
import { processEvent } from '@lily/api/services/achievements/checker'
import { AchievementNotifier } from '@lily/api/services/achievements/notifier'
import { aiIdentify } from '@lily/api/services/plants/endpoints/ai-identify'
import { awardRareIdentification } from '@lily/api/services/plants/helpers/rare-identification'
import { EnhancedPlantCreateRequest } from '@lily/shared/plant'
import { Array, Effect, Layer, Schema } from 'effect'
import type { PersistedFile } from 'effect/http/Multipart'
import { SqlError, UnknownError } from 'effect/sql/SqlError'
import { describe, expect, it } from 'vitest'

const photo = {
  _tag: 'PersistedFile',
  key: 'file',
  name: 'plant-photo.jpg',
  contentType: 'image/jpeg',
  path: '/tmp/plant-photo.jpg',
} as unknown as PersistedFile

const MockAchievementNotifier = Layer.succeed(AchievementNotifier, {
  notify: () => Effect.void,
  subscribe: Effect.die('subscribe not implemented in tests'),
})

const identify = (
  userId: string,
  isRareHouseplant: boolean,
  rows: RareIdentification[]
) =>
  aiIdentify([photo], 'en').pipe(
    Effect.provide(
      Layer.mergeAll(
        createMockAiService({ isRareHouseplant }),
        createMockGCSService(),
        createMockFileService,
        createMockFileSystem(),
        createMockCurrentUser({ id: userId }),
        createMockRareIdentificationRepository(rows),
        MockLimitCheckerLive,
        MockUsageTrackerLive
      )
    ),
    Effect.runPromise
  )

const saveAndUnlock = async (
  userId: string,
  imageUrl: string | undefined,
  repository: Layer.Layer<RareIdentificationRepository>
) => {
  const publishedEvents: AppEvent[] = []
  await Effect.runPromise(
    awardRareIdentification('plant-1', imageUrl).pipe(
      Effect.provide(
        Layer.mergeAll(
          repository,
          createMockCurrentUser({ id: userId }),
          createMockEventBus({ publishedEvents })
        )
      )
    )
  )

  const achievements = createMockAchievementRepository({ achievements: [] })
  const unlocked = await Effect.gen(function* () {
    yield* Effect.forEach(publishedEvents, processEvent, { discard: true })
    const repo = yield* AchievementRepository
    return yield* repo.findByUserId(userId)
  }).pipe(
    Effect.provide(Layer.merge(achievements, MockAchievementNotifier)),
    Effect.runPromise
  )

  return {
    publishedEvents,
    rareCollector: Array.some(
      unlocked,
      (row) => row.achievement === 'RARE_COLLECTOR'
    ),
  }
}

describe('Rare Collector from the identification answer', () => {
  it('unlocks when the user saves a plant identified as rare', async () => {
    const rows: RareIdentification[] = []
    const identified = await identify('user-1', true, rows)

    const result = await saveAndUnlock(
      'user-1',
      identified.imageUrl,
      createMockRareIdentificationRepository(rows)
    )

    expect(identified.isRareHouseplant).toBe(true)
    expect(result.publishedEvents).toEqual([
      { _tag: 'RarePlantIdentified', userId: 'user-1', plantId: 'plant-1' },
    ])
    expect(result.rareCollector).toBe(true)
  })

  it('does not unlock when the identification was not rare', async () => {
    const rows: RareIdentification[] = []
    const identified = await identify('user-1', false, rows)

    const result = await saveAndUnlock(
      'user-1',
      identified.imageUrl,
      createMockRareIdentificationRepository(rows)
    )

    expect(rows).toEqual([])
    expect(result.publishedEvents).toEqual([])
    expect(result.rareCollector).toBe(false)
  })

  it('ignores a rarity flag the client sends with the plant', async () => {
    const rows: RareIdentification[] = []
    const identified = await identify('user-1', false, rows)
    const payload = Schema.decodeUnknownSync(EnhancedPlantCreateRequest)({
      name: 'Monstera obliqua',
      imageUrl: identified.imageUrl,
      wateringFrequencyDays: 7,
      luxNeeded: 2000,
      petToxicityRating: 3,
      isRareHouseplant: true,
    })

    const result = await saveAndUnlock(
      'user-1',
      payload.imageUrl,
      createMockRareIdentificationRepository(rows)
    )

    expect(payload).not.toHaveProperty('isRareHouseplant')
    expect(result.publishedEvents).toEqual([])
    expect(result.rareCollector).toBe(false)
  })

  it("does not unlock from another user's rare identification", async () => {
    const rows: RareIdentification[] = []
    const identified = await identify('user-2', true, rows)

    const result = await saveAndUnlock(
      'user-1',
      identified.imageUrl,
      createMockRareIdentificationRepository(rows)
    )

    expect(result.publishedEvents).toEqual([])
    expect(result.rareCollector).toBe(false)
  })

  it('does not unlock a plant added without a photo', async () => {
    const rows: RareIdentification[] = []
    await identify('user-1', true, rows)

    const result = await saveAndUnlock(
      'user-1',
      undefined,
      createMockRareIdentificationRepository(rows)
    )

    expect(result.publishedEvents).toEqual([])
  })

  it('keeps the save successful when the lookup fails', async () => {
    const failing = Layer.succeed(RareIdentificationRepository, {
      record: () => Effect.void,
      exists: () =>
        Effect.fail(
          new SqlError({
            reason: new UnknownError({
              cause: new Error('database unreachable'),
              message: 'database unreachable',
            }),
          })
        ),
    })

    const result = await saveAndUnlock(
      'user-1',
      'https://storage.googleapis.com/mock-bucket/plants/a.jpg',
      failing
    )

    expect(result.publishedEvents).toEqual([])
  })
})
