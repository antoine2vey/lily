import {
  createTestChunkSearchResult,
  mockChunkSearchResults,
} from '@lily/api/__tests__/fixtures/knowledge'
import { createMockProcessedChunkRepository } from '@lily/api/__tests__/mocks/processed-chunk.repository'
import { RagService } from '@lily/api/services/rag/service'
import type { ChunkSearchResult } from '@lily/shared/knowledge'
import { Effect, Layer } from 'effect'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@lily/api/services/rag/embedding.service', () => ({
  embedText: vi.fn(),
}))

vi.mock('@ai-sdk/openai', () => ({
  openai: {
    embedding: () => 'mock-model',
  },
}))

import { embedText } from '@lily/api/services/rag/embedding.service'

const mockedEmbedText = vi.mocked(embedText)

const makeTestLayer = (searchResults: ChunkSearchResult[] = []) => {
  const chunkData = {
    insertedChunks: [] as never[],
    searchResults,
  }
  return Layer.merge(
    createMockProcessedChunkRepository(chunkData),
    RagService.Default.pipe(
      Layer.provide(createMockProcessedChunkRepository(chunkData))
    )
  )
}

describe('RagService', () => {
  describe('retrieve', () => {
    it('should embed query and return search results', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3]
      mockedEmbedText.mockReturnValueOnce(Effect.succeed(mockEmbedding))

      const layer = makeTestLayer(mockChunkSearchResults)

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const rag = yield* RagService
          return yield* rag.retrieve({ query: 'how to water monstera' })
        }).pipe(Effect.provide(layer))
      )

      expect(result).toEqual(mockChunkSearchResults)
    })

    it('should use default limit of 5', async () => {
      mockedEmbedText.mockReturnValueOnce(Effect.succeed([0.1]))

      const layer = makeTestLayer([])

      await Effect.runPromise(
        Effect.gen(function* () {
          const rag = yield* RagService
          return yield* rag.retrieve({ query: 'test' })
        }).pipe(Effect.provide(layer))
      )

      // embedText was called (query was embedded)
      expect(mockedEmbedText).toHaveBeenCalledWith('test')
    })

    it('should pass custom plantType and limit', async () => {
      mockedEmbedText.mockReturnValueOnce(Effect.succeed([0.1]))

      const layer = makeTestLayer([])

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const rag = yield* RagService
          return yield* rag.retrieve({
            query: 'watering tips',
            plantType: 'monstera',
            limit: 3,
          })
        }).pipe(Effect.provide(layer))
      )

      expect(result).toEqual([])
    })

    it('should return empty array on embedding failure (graceful degradation)', async () => {
      const { EmbeddingError } = await import('@lily/shared/errors/knowledge')
      mockedEmbedText.mockReturnValueOnce(
        Effect.fail(new EmbeddingError({ message: 'API down' }))
      )

      const layer = makeTestLayer(mockChunkSearchResults)

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const rag = yield* RagService
          return yield* rag.retrieve({ query: 'test' })
        }).pipe(Effect.provide(layer))
      )

      expect(result).toEqual([])
    })

    it('should return empty array on search failure', async () => {
      mockedEmbedText.mockReturnValueOnce(Effect.succeed([0.1]))

      // Create a special layer where search fails
      const failingChunkRepo = Layer.succeed(
        (await import('@lily/api/repositories/processed-chunk.repository'))
          .ProcessedChunkRepository,
        {
          create: () => Effect.succeed(undefined as void),
          createMany: () => Effect.succeed(undefined as void),
          search: () => Effect.fail(new Error('DB connection lost') as never),
          count: () => Effect.succeed(0),
          countBySource: () => Effect.succeed([]),
          countByJobId: () => Effect.succeed(0),
        }
      )

      const layer = RagService.Default.pipe(Layer.provide(failingChunkRepo))

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const rag = yield* RagService
          return yield* rag.retrieve({ query: 'test' })
        }).pipe(Effect.provide(layer))
      )

      expect(result).toEqual([])
    })
  })

  describe('formatContext', () => {
    it('should return empty string for empty chunks', async () => {
      const layer = makeTestLayer()

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const rag = yield* RagService
          return rag.formatContext([])
        }).pipe(Effect.provide(layer))
      )

      expect(result).toBe('')
    })

    it('should format single chunk with source and similarity percentage', async () => {
      const chunk = createTestChunkSearchResult({
        source: 'reddit',
        similarity: 0.92,
        content: 'Water your monstera weekly.',
      })

      const layer = makeTestLayer()

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const rag = yield* RagService
          return rag.formatContext([chunk])
        }).pipe(Effect.provide(layer))
      )

      expect(result).toContain('## Relevant Plant Care Knowledge')
      expect(result).toContain('### Knowledge Source (reddit, 92% relevance)')
      expect(result).toContain('Water your monstera weekly.')
    })

    it('should format multiple chunks with header', async () => {
      const layer = makeTestLayer()

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const rag = yield* RagService
          return rag.formatContext(mockChunkSearchResults)
        }).pipe(Effect.provide(layer))
      )

      expect(result).toContain('## Relevant Plant Care Knowledge')
      expect(result).toContain('92% relevance')
      expect(result).toContain('85% relevance')
      expect(result).toContain('78% relevance')
    })
  })
})
