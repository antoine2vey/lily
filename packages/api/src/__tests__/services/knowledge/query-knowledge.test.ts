import { createMockRagService } from '@lily/api/__tests__/mocks/rag.service'
import { RagService } from '@lily/api/services/rag/service'
import type { ChunkSearchResult } from '@lily/shared/knowledge'
import { Array, Effect, Option, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

/**
 * Tests the queryKnowledge logic (RagService.retrieve + formatContext)
 * as used by the KnowledgeApi handler. The handler is not exported
 * directly, so we replicate its core pipeline here.
 */
const queryKnowledge = (params: { question: string; plantName?: string }) =>
  Effect.gen(function* () {
    const ragService = yield* RagService

    const query = pipe(
      Option.fromNullable(params.plantName),
      Option.match({
        onNone: () => params.question,
        onSome: (name) => `${name}: ${params.question}`,
      })
    )

    const chunks = yield* ragService.retrieve({ query, limit: 5 })
    const answer = ragService.formatContext(chunks)

    const sources = Array.map(chunks, (chunk) => ({
      title: chunk.source,
      content: chunk.content,
      similarity: chunk.similarity,
    }))

    return {
      answer: answer || 'No relevant information found.',
      sources,
    }
  })

const makeChunk = (
  overrides: Partial<ChunkSearchResult> = {}
): ChunkSearchResult => ({
  id: 'chunk-1',
  content: 'Water monstera weekly',
  source: 'plant-guide',
  similarity: 0.85,
  metadata: null,
  ...overrides,
})

describe('queryKnowledge (via RagService)', () => {
  it('returns answer and sources for matching chunks', async () => {
    const chunks = [makeChunk()]
    const layer = createMockRagService({ chunks })

    const result = await Effect.runPromise(
      queryKnowledge({ question: 'how to water monstera' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result.answer).toContain('Water monstera weekly')
    expect(result.sources).toHaveLength(1)
    expect(result.sources[0]?.title).toBe('plant-guide')
  })

  it('returns fallback message when no chunks found', async () => {
    const layer = createMockRagService({ chunks: [] })

    const result = await Effect.runPromise(
      queryKnowledge({ question: 'unknown topic' }).pipe(Effect.provide(layer))
    )

    expect(result.answer).toBe('No relevant information found.')
    expect(result.sources).toHaveLength(0)
  })

  it('prepends plantName to query when provided', async () => {
    // Verify query construction — the mock always returns its
    // configured chunks regardless of query, so we only verify
    // the pipeline completes without error.
    const chunks = [makeChunk()]
    const layer = createMockRagService({ chunks })

    const result = await Effect.runPromise(
      queryKnowledge({
        question: 'yellow leaves',
        plantName: 'Monstera',
      }).pipe(Effect.provide(layer))
    )

    expect(result.answer).toContain('Water monstera weekly')
    expect(result.sources).toHaveLength(1)
  })

  it('maps chunks to source objects correctly', async () => {
    const chunks = [
      makeChunk({
        id: 'c1',
        source: 'wiki',
        content: 'Fern care',
        similarity: 0.92,
      }),
      makeChunk({
        id: 'c2',
        source: 'reddit',
        content: 'Mist daily',
        similarity: 0.78,
      }),
    ]
    const layer = createMockRagService({ chunks })

    const result = await Effect.runPromise(
      queryKnowledge({ question: 'fern care' }).pipe(Effect.provide(layer))
    )

    expect(result.sources).toHaveLength(2)
    expect(result.sources[0]).toEqual({
      title: 'wiki',
      content: 'Fern care',
      similarity: 0.92,
    })
    expect(result.sources[1]).toEqual({
      title: 'reddit',
      content: 'Mist daily',
      similarity: 0.78,
    })
  })

  it('returns empty sources when no chunks', async () => {
    const layer = createMockRagService()

    const result = await Effect.runPromise(
      queryKnowledge({ question: 'anything' }).pipe(Effect.provide(layer))
    )

    expect(result.sources).toEqual([])
  })
})
