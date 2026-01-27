import { createMockAiService } from '@lily/api/__tests__/mocks/ai.service'
import { createMockPgDrizzle } from '@lily/api/__tests__/mocks/pg-drizzle'
import { AiService } from '@lily/api/services/ai/service'
import { Effect, Layer, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

const testLayer = Layer.merge(createMockAiService(), createMockPgDrizzle())

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
      expect(result.sunlightPreference).toBe('medium')
      expect(result.category).toBe('Tropical')
    })
  })

  describe('plantChat', () => {
    it('should return stream for plant chat', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const aiService = yield* AiService
          const stream = yield* aiService.plantChat('plant-1', [
            {
              id: '1',
              role: 'user',
              parts: [{ type: 'text', text: 'How often should I water this?' }],
            },
          ])
          const chunks = yield* Stream.runCollect(stream)
          return chunks
        }).pipe(Effect.provide(testLayer))
      )

      expect(result.length).toBeGreaterThan(0)
    })

    it('should use custom response when provided', async () => {
      const customResponse = 'Water your Monstera every 7-10 days'

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const aiService = yield* AiService
          const stream = yield* aiService.plantChat('plant-1', [
            {
              id: '1',
              role: 'user',
              parts: [{ type: 'text', text: 'How often should I water?' }],
            },
          ])
          const chunks = yield* Stream.runCollect(stream)
          // Decode the chunks
          const decoder = new TextDecoder()
          let fullResponse = ''
          for (const chunk of chunks) {
            fullResponse += decoder.decode(chunk)
          }
          return fullResponse
        }).pipe(
          Effect.provide(
            Layer.merge(
              createMockAiService({ plantChatResponse: customResponse }),
              createMockPgDrizzle()
            )
          )
        )
      )

      expect(result).toBe(customResponse)
    })

    it('should handle conversation history', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const aiService = yield* AiService
          const stream = yield* aiService.plantChat('plant-1', [
            {
              id: '1',
              role: 'user',
              parts: [{ type: 'text', text: 'What plant is this?' }],
            },
            {
              id: '2',
              role: 'assistant',
              parts: [{ type: 'text', text: 'This appears to be a Monstera.' }],
            },
            {
              id: '3',
              role: 'user',
              parts: [{ type: 'text', text: 'How do I care for it?' }],
            },
          ])
          return stream
        }).pipe(Effect.provide(testLayer))
      )

      expect(result).toBeDefined()
    })

    it('should return default response when not customized', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const aiService = yield* AiService
          const stream = yield* aiService.plantChat('plant-1', [
            {
              id: '1',
              role: 'user',
              parts: [{ type: 'text', text: 'Hello' }],
            },
          ])
          const chunks = yield* Stream.runCollect(stream)
          const decoder = new TextDecoder()
          let fullResponse = ''
          for (const chunk of chunks) {
            fullResponse += decoder.decode(chunk)
          }
          return fullResponse
        }).pipe(Effect.provide(testLayer))
      )

      expect(result).toBe('Mock AI response')
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
      expect(result.sunlightPreference).toBe('medium')
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
