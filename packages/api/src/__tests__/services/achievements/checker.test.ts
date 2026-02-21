import { createMockAchievementRepository } from '@lily/api/__tests__/mocks/achievement.repository'
import type { AppEvent } from '@lily/api/events'
import { AchievementRepository } from '@lily/api/repositories/achievement.repository'
import { processEvent } from '@lily/api/services/achievements/checker'
import { AchievementNotifier } from '@lily/api/services/achievements/notifier'
import { Array, Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

// No-op notifier for testing - just swallows notifications
const MockAchievementNotifier = Layer.succeed(AchievementNotifier, {
  notify: () => Effect.void,
  subscribe: Effect.die('subscribe not implemented in tests'),
})

const withNotifier = (repoLayer: Layer.Layer<AchievementRepository>) =>
  Layer.merge(repoLayer, MockAchievementNotifier)

describe('Achievement Checker', () => {
  describe('PlantCreated event', () => {
    it('should unlock FIRST_PLANT_ADDED on first plant', async () => {
      const mockRepo = createMockAchievementRepository({
        achievements: [],
        plantCount: 1,
      })

      const event: AppEvent = {
        _tag: 'PlantCreated',
        userId: 'user-1',
        plantId: 'plant-1',
      }

      await Effect.runPromise(
        processEvent(event).pipe(Effect.provide(withNotifier(mockRepo)))
      )

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* AchievementRepository
          return yield* repo.findByUserId('user-1')
        }).pipe(Effect.provide(mockRepo))
      )

      expect(
        Array.some(result, (a) => a.achievement === 'FIRST_PLANT_ADDED')
      ).toBe(true)
    })

    it('should unlock PLANT_COLLECTOR when user has 5+ plants', async () => {
      const mockRepo = createMockAchievementRepository({
        achievements: [],
        plantCount: 5,
      })

      const event: AppEvent = {
        _tag: 'PlantCreated',
        userId: 'user-1',
        plantId: 'plant-5',
      }

      await Effect.runPromise(
        processEvent(event).pipe(Effect.provide(withNotifier(mockRepo)))
      )

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* AchievementRepository
          return yield* repo.findByUserId('user-1')
        }).pipe(Effect.provide(mockRepo))
      )

      expect(
        Array.some(result, (a) => a.achievement === 'PLANT_COLLECTOR')
      ).toBe(true)
    })

    it('should not unlock PLANT_COLLECTOR when user has less than 5 plants', async () => {
      const mockRepo = createMockAchievementRepository({
        achievements: [],
        plantCount: 3,
      })

      const event: AppEvent = {
        _tag: 'PlantCreated',
        userId: 'user-1',
        plantId: 'plant-3',
      }

      await Effect.runPromise(
        processEvent(event).pipe(Effect.provide(withNotifier(mockRepo)))
      )

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* AchievementRepository
          return yield* repo.findByUserId('user-1')
        }).pipe(Effect.provide(mockRepo))
      )

      expect(
        Array.some(result, (a) => a.achievement === 'PLANT_COLLECTOR')
      ).toBe(false)
    })
  })

  describe('CareLogCreated event', () => {
    it('should unlock WATERING_NOVICE when user has 10+ waterings', async () => {
      const mockRepo = createMockAchievementRepository({
        achievements: [],
        careLogCounts: { watering: 10, fertilization: 0 },
        careStreak: 0,
      })

      const event: AppEvent = {
        _tag: 'CareLogCreated',
        userId: 'user-1',
        plantId: 'plant-1',
        careLogId: 'log-1',
        type: 'watering',
      }

      await Effect.runPromise(
        processEvent(event).pipe(Effect.provide(withNotifier(mockRepo)))
      )

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* AchievementRepository
          return yield* repo.findByUserId('user-1')
        }).pipe(Effect.provide(mockRepo))
      )

      expect(
        Array.some(result, (a) => a.achievement === 'WATERING_NOVICE')
      ).toBe(true)
    })

    it('should not unlock WATERING_NOVICE when user has less than 10 waterings', async () => {
      const mockRepo = createMockAchievementRepository({
        achievements: [],
        careLogCounts: { watering: 5, fertilization: 0 },
        careStreak: 0,
      })

      const event: AppEvent = {
        _tag: 'CareLogCreated',
        userId: 'user-1',
        plantId: 'plant-1',
        careLogId: 'log-1',
        type: 'watering',
      }

      await Effect.runPromise(
        processEvent(event).pipe(Effect.provide(withNotifier(mockRepo)))
      )

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* AchievementRepository
          return yield* repo.findByUserId('user-1')
        }).pipe(Effect.provide(mockRepo))
      )

      expect(
        Array.some(result, (a) => a.achievement === 'WATERING_NOVICE')
      ).toBe(false)
    })

    it('should unlock FERTILIZER_GURU when user has 10+ fertilizations', async () => {
      const mockRepo = createMockAchievementRepository({
        achievements: [],
        careLogCounts: { watering: 0, fertilization: 10 },
        careStreak: 0,
      })

      const event: AppEvent = {
        _tag: 'CareLogCreated',
        userId: 'user-1',
        plantId: 'plant-1',
        careLogId: 'log-1',
        type: 'fertilization',
      }

      await Effect.runPromise(
        processEvent(event).pipe(Effect.provide(withNotifier(mockRepo)))
      )

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* AchievementRepository
          return yield* repo.findByUserId('user-1')
        }).pipe(Effect.provide(mockRepo))
      )

      expect(
        Array.some(result, (a) => a.achievement === 'FERTILIZER_GURU')
      ).toBe(true)
    })

    it('should unlock DEDICATED_CARETAKER when user has 3+ day streak', async () => {
      const mockRepo = createMockAchievementRepository({
        achievements: [],
        careLogCounts: { watering: 0, fertilization: 0 },
        careStreak: 3,
      })

      const event: AppEvent = {
        _tag: 'CareLogCreated',
        userId: 'user-1',
        plantId: 'plant-1',
        careLogId: 'log-1',
        type: 'watering',
      }

      await Effect.runPromise(
        processEvent(event).pipe(Effect.provide(withNotifier(mockRepo)))
      )

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* AchievementRepository
          return yield* repo.findByUserId('user-1')
        }).pipe(Effect.provide(mockRepo))
      )

      expect(
        Array.some(result, (a) => a.achievement === 'DEDICATED_CARETAKER')
      ).toBe(true)
    })

    it('should not unlock DEDICATED_CARETAKER when streak is less than 3 days', async () => {
      const mockRepo = createMockAchievementRepository({
        achievements: [],
        careLogCounts: { watering: 0, fertilization: 0 },
        careStreak: 2,
      })

      const event: AppEvent = {
        _tag: 'CareLogCreated',
        userId: 'user-1',
        plantId: 'plant-1',
        careLogId: 'log-1',
        type: 'watering',
      }

      await Effect.runPromise(
        processEvent(event).pipe(Effect.provide(withNotifier(mockRepo)))
      )

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* AchievementRepository
          return yield* repo.findByUserId('user-1')
        }).pipe(Effect.provide(mockRepo))
      )

      expect(
        Array.some(result, (a) => a.achievement === 'DEDICATED_CARETAKER')
      ).toBe(false)
    })
  })

  describe('ChatMessageSent event', () => {
    it('should unlock AI_CONVERSATIONALIST on first chat message', async () => {
      const mockRepo = createMockAchievementRepository({
        achievements: [],
      })

      const event: AppEvent = {
        _tag: 'ChatMessageSent',
        userId: 'user-1',
        plantId: 'plant-1',
        messageId: 'msg-1',
      }

      await Effect.runPromise(
        processEvent(event).pipe(Effect.provide(withNotifier(mockRepo)))
      )

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* AchievementRepository
          return yield* repo.findByUserId('user-1')
        }).pipe(Effect.provide(mockRepo))
      )

      expect(
        Array.some(result, (a) => a.achievement === 'AI_CONVERSATIONALIST')
      ).toBe(true)
    })
  })

  describe('PhotoUploaded event', () => {
    it('should unlock PHOTO_PRO when user has 10+ photos', async () => {
      const mockRepo = createMockAchievementRepository({
        achievements: [],
        photoCount: 10,
      })

      const event: AppEvent = {
        _tag: 'PhotoUploaded',
        userId: 'user-1',
        plantId: 'plant-1',
        photoId: 'photo-10',
      }

      await Effect.runPromise(
        processEvent(event).pipe(Effect.provide(withNotifier(mockRepo)))
      )

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* AchievementRepository
          return yield* repo.findByUserId('user-1')
        }).pipe(Effect.provide(mockRepo))
      )

      expect(Array.some(result, (a) => a.achievement === 'PHOTO_PRO')).toBe(
        true
      )
    })

    it('should not unlock PHOTO_PRO when user has less than 10 photos', async () => {
      const mockRepo = createMockAchievementRepository({
        achievements: [],
        photoCount: 5,
      })

      const event: AppEvent = {
        _tag: 'PhotoUploaded',
        userId: 'user-1',
        plantId: 'plant-1',
        photoId: 'photo-5',
      }

      await Effect.runPromise(
        processEvent(event).pipe(Effect.provide(withNotifier(mockRepo)))
      )

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* AchievementRepository
          return yield* repo.findByUserId('user-1')
        }).pipe(Effect.provide(mockRepo))
      )

      expect(Array.some(result, (a) => a.achievement === 'PHOTO_PRO')).toBe(
        false
      )
    })
  })

  describe('PlantScanned event', () => {
    it('should handle PlantScanned event without errors', async () => {
      const mockRepo = createMockAchievementRepository({
        achievements: [],
      })

      const event: AppEvent = {
        _tag: 'PlantScanned',
        userId: 'user-1',
        scanId: 'scan-1',
      }

      // Should not throw
      await Effect.runPromise(
        processEvent(event).pipe(Effect.provide(withNotifier(mockRepo)))
      )
    })
  })

  describe('Idempotency', () => {
    it('should not duplicate achievements when called multiple times', async () => {
      const mockRepo = createMockAchievementRepository({
        achievements: [],
      })
      const layers = withNotifier(mockRepo)

      const event: AppEvent = {
        _tag: 'ChatMessageSent',
        userId: 'user-1',
        plantId: 'plant-1',
        messageId: 'msg-1',
      }

      // Process the same event multiple times
      await Effect.runPromise(processEvent(event).pipe(Effect.provide(layers)))
      await Effect.runPromise(processEvent(event).pipe(Effect.provide(layers)))
      await Effect.runPromise(processEvent(event).pipe(Effect.provide(layers)))

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* AchievementRepository
          return yield* repo.findByUserId('user-1')
        }).pipe(Effect.provide(mockRepo))
      )

      // Should only have one AI_CONVERSATIONALIST achievement
      const aiConversationalistCount = Array.filter(
        result,
        (a) => a.achievement === 'AI_CONVERSATIONALIST'
      ).length
      expect(aiConversationalistCount).toBe(1)
    })
  })
})
