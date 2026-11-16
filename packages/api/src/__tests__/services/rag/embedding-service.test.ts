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

/** text-embedding-3-large rejects more. A token spans at least one byte. */
const MODEL_TOKEN_LIMIT = 8192
const utf8Length = (text: string) => new TextEncoder().encode(text).length
const oversized = `a${'🪴'.repeat(5000)}`

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

  it('sends a text the model would reject as its longest prefix that fits, cut between characters', async () => {
    mockedEmbed.mockResolvedValueOnce({
      embedding: [0.1],
      usage: { tokens: 5 },
    } as Awaited<ReturnType<typeof embed>>)

    await Effect.runPromise(embedText(oversized))

    const sent = mockedEmbed.mock.lastCall?.[0].value as string
    expect(utf8Length(sent)).toBeLessThanOrEqual(MODEL_TOKEN_LIMIT)
    expect(utf8Length(sent)).toBeGreaterThan(MODEL_TOKEN_LIMIT - 200)
    expect(oversized.startsWith(sent)).toBe(true)
    expect(sent.endsWith('🪴')).toBe(true)
  })

  it('sends a text that fits unchanged', async () => {
    mockedEmbed.mockResolvedValueOnce({
      embedding: [0.1],
      usage: { tokens: 5 },
    } as Awaited<ReturnType<typeof embed>>)

    await Effect.runPromise(embedText('How often do I water a 🪴?'))

    expect(mockedEmbed.mock.lastCall?.[0].value).toBe(
      'How often do I water a 🪴?'
    )
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

  it('shortens only the texts the model would reject, so one long chunk cannot fail the batch', async () => {
    mockedEmbedMany.mockResolvedValueOnce({
      embeddings: [[0.1], [0.2]],
      usage: { tokens: 10 },
    } as Awaited<ReturnType<typeof embedMany>>)

    await Effect.runPromise(embedTexts(['Repot in spring.', oversized]))

    const sent = mockedEmbedMany.mock.lastCall?.[0].values as string[]
    expect(sent).toHaveLength(2)
    expect(sent[0]).toBe('Repot in spring.')
    expect(utf8Length(sent[1] ?? '')).toBeLessThanOrEqual(MODEL_TOKEN_LIMIT)
    expect(oversized.startsWith(sent[1] ?? 'x')).toBe(true)
  })

  it('should return EmbeddingError on failure', async () => {
    mockedEmbedMany.mockRejectedValueOnce(new Error('API error'))

    const exit = await Effect.runPromiseExit(
      embedTexts(['text one', 'text two'])
    )
    expect(Exit.isFailure(exit)).toBe(true)
  })
})
