import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { createMockAiService } from '@lily/api/__tests__/mocks/ai.service'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockDiagnosisRepository } from '@lily/api/__tests__/mocks/diagnosis.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { AiService } from '@lily/api/services/ai/service'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const testLayer = Layer.mergeAll(
  createMockAiService(),
  createMockPlantRepository({ plants: mockPlants }),
  createMockCareLogRepository([]),
  createMockDiagnosisRepository([]),
  createMockCurrentUser({ id: 'user-1' })
)

describe('AiService (mock)', () => {
  describe('plantRecognition', () => {
    it('should return plant data object', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const aiService = yield* AiService
          return yield* aiService.plantRecognition(
            'https://example.com/plant.jpg'
          )
        }).pipe(Effect.provide(testLayer))
      )

      expect(result.name).toBe('Mock Plant')
      expect(result.confidence).toBe(0.95)
    })

    it('should include care data in response', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const aiService = yield* AiService
          return yield* aiService.plantRecognition(
            'https://storage.example.com/images/monstera.png'
          )
        }).pipe(Effect.provide(testLayer))
      )

      expect(result.wateringFrequencyDays).toBe(7)
      expect(result.luxNeeded).toBe(2000)
      expect(result.category).toBe('Tropical')
    })
  })

  describe('plantCardScan', () => {
    it('should return scanned plant data', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const aiService = yield* AiService
          return yield* aiService.plantCardScan(
            'https://example.com/plant-card.jpg'
          )
        }).pipe(Effect.provide(testLayer))
      )

      expect(result).toBeDefined()
      expect(result.name).toBe('Mock Plant')
      expect(result.description).toBe('A mock plant description')
    })

    it('should return null for optional fields', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const aiService = yield* AiService
          return yield* aiService.plantCardScan(
            'https://example.com/plant-card.jpg'
          )
        }).pipe(Effect.provide(testLayer))
      )

      expect(result.humidityRating).toBe(50)
      expect(result.petToxicityRating).toBe(20)
      expect(result.luxNeeded).toBe(2000)
      expect(result.wateringFrequencyDays).toBe(7)
      expect(result.fertilizationFrequencyDays).toBe(30)
      expect(result.category).toBe('Tropical')
    })

    it('should process different image URLs', async () => {
      const urls = [
        'https://storage.example.com/cards/monstera.jpg',
        'https://cdn.example.com/plants/fern.png',
        'https://images.example.com/scan/palm.webp',
      ]

      for (const url of urls) {
        const result = await Effect.runPromise(
          Effect.gen(function* () {
            const aiService = yield* AiService
            return yield* aiService.plantCardScan(url)
          }).pipe(Effect.provide(testLayer))
        )

        expect(result.name).toBeDefined()
      }
    })
  })
})
