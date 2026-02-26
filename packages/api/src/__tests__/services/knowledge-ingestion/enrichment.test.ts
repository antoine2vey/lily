import { Effect, Exit } from 'effect'
import { describe, expect, it, vi } from 'vitest'

vi.mock('ai', () => ({
  generateText: vi.fn(),
  Output: {
    object: vi.fn((opts: unknown) => opts),
  },
}))

vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn(() => 'mock-model'),
}))

import { enrichChunk } from '@lily/api/services/knowledge-ingestion/processing/enrichment'
import { generateText } from 'ai'

const mockedGenerateText = vi.mocked(generateText)

describe('enrichChunk', () => {
  it('should return keywords on success', async () => {
    mockedGenerateText.mockResolvedValueOnce({
      output: {
        keywords: ['monstera', 'watering frequency', 'soil moisture'],
      },
    } as Awaited<ReturnType<typeof generateText>>)

    const result = await Effect.runPromise(
      enrichChunk('Q: How often to water monstera?\n\nSome post content...')
    )

    expect(result.keywords).toEqual([
      'monstera',
      'watering frequency',
      'soil moisture',
    ])
  })

  it('should call generateText with correct parameters', async () => {
    mockedGenerateText.mockResolvedValueOnce({
      output: {
        keywords: ['test'],
      },
    } as Awaited<ReturnType<typeof generateText>>)

    await Effect.runPromise(enrichChunk('test content'))

    expect(mockedGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('plant care knowledge indexer'),
        prompt: 'test content',
        output: expect.anything(),
      })
    )
  })

  it('should return EnrichmentError on failure', async () => {
    mockedGenerateText.mockRejectedValueOnce(new Error('API error'))

    const exit = await Effect.runPromiseExit(enrichChunk('some content'))

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain('EnrichmentError')
    }
  })

  it('should be recoverable with catchAll (graceful fallback pattern)', async () => {
    mockedGenerateText.mockRejectedValueOnce(new Error('API timeout'))

    const result = await Effect.runPromise(
      enrichChunk('some content').pipe(
        Effect.catchAll(() => Effect.succeed(undefined))
      )
    )

    expect(result).toBeUndefined()
  })
})
