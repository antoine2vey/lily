import { createMockAiService } from '@lily/api/__tests__/mocks/ai.service'
import { AiService } from '@lily/api/services/ai/service'
import { Effect, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

describe('AiService (mock)', () => {
  describe('plantRecognition', () => {
    it('should return stream for plant recognition', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const aiService = yield* AiService
          const stream = yield* aiService.plantRecognition(
            'https://example.com/plant.jpg'
          )
          // Collect stream to array
          const chunks = yield* Stream.runCollect(stream)
          return chunks
        }).pipe(Effect.provide(createMockAiService()))
      )

      expect(result.length).toBeGreaterThan(0)
    })

    it('should process image URL correctly', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const aiService = yield* AiService
          const stream = yield* aiService.plantRecognition(
            'https://storage.example.com/images/monstera.png'
          )
          return stream
        }).pipe(Effect.provide(createMockAiService()))
      )

      expect(result).toBeDefined()
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
              content: 'How often should I water this?',
            },
          ])
          const chunks = yield* Stream.runCollect(stream)
          return chunks
        }).pipe(Effect.provide(createMockAiService()))
      )

      expect(result.length).toBeGreaterThan(0)
    })

    it('should use custom response when provided', async () => {
      const customResponse = 'Water your Monstera every 7-10 days'

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const aiService = yield* AiService
          const stream = yield* aiService.plantChat('plant-1', [
            { id: '1', role: 'user', content: 'How often should I water?' },
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
            createMockAiService({ plantChatResponse: customResponse })
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
            { id: '1', role: 'user', content: 'What plant is this?' },
            {
              id: '2',
              role: 'assistant',
              content: 'This appears to be a Monstera.',
            },
            { id: '3', role: 'user', content: 'How do I care for it?' },
          ])
          return stream
        }).pipe(Effect.provide(createMockAiService()))
      )

      expect(result).toBeDefined()
    })

    it('should return default response when not customized', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const aiService = yield* AiService
          const stream = yield* aiService.plantChat('plant-1', [
            { id: '1', role: 'user', content: 'Hello' },
          ])
          const chunks = yield* Stream.runCollect(stream)
          const decoder = new TextDecoder()
          let fullResponse = ''
          for (const chunk of chunks) {
            fullResponse += decoder.decode(chunk)
          }
          return fullResponse
        }).pipe(Effect.provide(createMockAiService()))
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
        }).pipe(Effect.provide(createMockAiService()))
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
        }).pipe(Effect.provide(createMockAiService()))
      )

      expect(result.humidityRating).toBeNull()
      expect(result.lightingRating).toBeNull()
      expect(result.petToxicityRating).toBeNull()
      expect(result.wateringRating).toBeNull()
      expect(result.wateringFrequencyDays).toBeNull()
      expect(result.fertilizationFrequencyDays).toBeNull()
      expect(result.category).toBeNull()
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
          }).pipe(Effect.provide(createMockAiService()))
        )

        expect(result.name).toBeDefined()
      }
    })
  })
})
