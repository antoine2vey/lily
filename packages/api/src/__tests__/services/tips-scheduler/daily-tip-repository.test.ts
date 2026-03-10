import {
  mockDailyTips,
  mockTip1,
} from '@lily/api/__tests__/fixtures/daily-tips'
import { createMockDailyTipRepository } from '@lily/api/__tests__/mocks/daily-tip.repository'
import { DailyTipRepository } from '@lily/api/repositories/daily-tip.repository'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

describe('DailyTipRepository', () => {
  describe('findByDate', () => {
    it('should find a tip by date', async () => {
      const mockRepo = createMockDailyTipRepository(mockDailyTips)

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* DailyTipRepository
          return yield* repo.findByDate('2026-03-09')
        }).pipe(Effect.provide(mockRepo))
      )

      expect(result).not.toBeNull()
      expect(result?.id).toBe('tip-1')
      expect(result?.title.en).toBe('Water in the morning')
    })

    it('should return null when no tip exists for date', async () => {
      const mockRepo = createMockDailyTipRepository(mockDailyTips)

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* DailyTipRepository
          return yield* repo.findByDate('2026-03-10')
        }).pipe(Effect.provide(mockRepo))
      )

      expect(result).toBeNull()
    })
  })

  describe('findRecent', () => {
    it('should return recent tips sorted by date descending', async () => {
      const mockRepo = createMockDailyTipRepository(mockDailyTips)

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* DailyTipRepository
          return yield* repo.findRecent(5)
        }).pipe(Effect.provide(mockRepo))
      )

      expect(result).toHaveLength(2)
      // Most recent first
      expect(result[0]?.publishDate).toBe('2026-03-09')
      expect(result[1]?.publishDate).toBe('2026-03-08')
    })

    it('should respect the limit parameter', async () => {
      const mockRepo = createMockDailyTipRepository(mockDailyTips)

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* DailyTipRepository
          return yield* repo.findRecent(1)
        }).pipe(Effect.provide(mockRepo))
      )

      expect(result).toHaveLength(1)
    })
  })

  describe('create', () => {
    it('should create a new daily tip', async () => {
      const mockRepo = createMockDailyTipRepository([])

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* DailyTipRepository
          return yield* repo.create({
            title: { en: 'New tip', fr: 'Nouveau conseil' },
            body: { en: 'Tip body content', fr: 'Contenu du conseil' },
            category: 'watering',
            tags: ['watering'],
            publishDate: '2026-03-10',
          })
        }).pipe(Effect.provide(mockRepo))
      )

      expect(result).not.toBeNull()
      expect(result?.title.en).toBe('New tip')
      expect(result?.publishDate).toBe('2026-03-10')
      expect(result?.category).toBe('watering')
    })

    it('should be findable after creation', async () => {
      const mockRepo = createMockDailyTipRepository([])

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* DailyTipRepository
          yield* repo.create({
            title: { en: 'New tip', fr: 'Nouveau conseil' },
            body: { en: 'Body', fr: 'Corps' },
            category: 'light',
            tags: [],
            publishDate: '2026-03-10',
          })
          return yield* repo.findByDate('2026-03-10')
        }).pipe(Effect.provide(mockRepo))
      )

      expect(result).not.toBeNull()
      expect(result?.title.en).toBe('New tip')
    })
  })
})
