import { Effect, Exit } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return {
    ...actual,
    generateText: vi.fn(),
    Output: {
      object: vi.fn((opts: unknown) => opts),
    },
  }
})

vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn(() => 'mock-model'),
}))

import { enrichChunk } from '@lily/api/services/knowledge-ingestion/processing/enrichment'
import { generateText } from 'ai'

const mockedGenerateText = vi.mocked(generateText)

describe('enrichChunk', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

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

  it('should return OpenAIError on failure', async () => {
    vi.useFakeTimers()
    mockedGenerateText.mockRejectedValue(new Error('API error'))

    const exitPromise = Effect.runPromiseExit(enrichChunk('some content'))
    await vi.runAllTimersAsync()
    const exit = await exitPromise

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain('OpenAIError')
    }
  })

  it('should be recoverable with catchAll (graceful fallback pattern)', async () => {
    vi.useFakeTimers()
    mockedGenerateText.mockRejectedValue(new Error('API timeout'))

    const resultPromise = Effect.runPromise(
      enrichChunk('some content').pipe(Effect.catchAll(() => Effect.void))
    )
    await vi.runAllTimersAsync()
    const result = await resultPromise

    expect(result).toBeUndefined()
  })
})
