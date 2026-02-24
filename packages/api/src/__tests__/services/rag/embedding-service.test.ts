import { Effect, Exit } from 'effect'
import { describe, expect, it, vi } from 'vitest'

vi.mock('ai', () => ({
  embed: vi.fn(),
  embedMany: vi.fn(),
}))

vi.mock('@ai-sdk/openai', () => ({
  openai: {
    embedding: () => 'mock-model',
  },
}))

import { embedText, embedTexts } from '@lily/api/services/rag/embedding.service'
import { embed, embedMany } from 'ai'

const mockedEmbed = vi.mocked(embed)
const mockedEmbedMany = vi.mocked(embedMany)

describe('embedText', () => {
  it('should return embedding vector on success', async () => {
    const mockEmbedding = [0.1, 0.2, 0.3]
    mockedEmbed.mockResolvedValueOnce({
      embedding: mockEmbedding,
      usage: { tokens: 5 },
    } as Awaited<ReturnType<typeof embed>>)

    const result = await Effect.runPromise(embedText('test query'))
    expect(result).toEqual(mockEmbedding)
  })

  it('should return EmbeddingError on failure', async () => {
    mockedEmbed.mockRejectedValueOnce(new Error('API rate limit'))

    const exit = await Effect.runPromiseExit(embedText('test query'))
    expect(Exit.isFailure(exit)).toBe(true)

    if (Exit.isFailure(exit)) {
      const error = exit.cause
      expect(String(error)).toContain('EmbeddingError')
    }
  })
})

describe('embedTexts', () => {
  it('should return empty array for empty input', async () => {
    const result = await Effect.runPromise(embedTexts([]))
    expect(result).toEqual([])
  })

  it('should return vectors for multiple texts', async () => {
    const mockEmbeddings = [
      [0.1, 0.2],
      [0.3, 0.4],
    ]
    mockedEmbedMany.mockResolvedValueOnce({
      embeddings: mockEmbeddings,
      usage: { tokens: 10 },
    } as Awaited<ReturnType<typeof embedMany>>)

    const result = await Effect.runPromise(embedTexts(['text one', 'text two']))
    expect(result).toEqual(mockEmbeddings)
  })

  it('should return EmbeddingError on failure', async () => {
    mockedEmbedMany.mockRejectedValueOnce(new Error('API error'))

    const exit = await Effect.runPromiseExit(
      embedTexts(['text one', 'text two'])
    )
    expect(Exit.isFailure(exit)).toBe(true)
  })
})
