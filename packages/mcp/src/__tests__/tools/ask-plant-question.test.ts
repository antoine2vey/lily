import { createMockRagService } from '@lily/api/__tests__/mocks/rag.service'
import { askPlantQuestionEffect } from '@lily/mcp/tools/ask-plant-question'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('askPlantQuestion MCP tool', () => {
  it('should return knowledge base content when chunks found', async () => {
    const mockChunks = [
      {
        id: 'chunk-1',
        content: 'Monstera plants prefer bright indirect light.',
        source: 'plant-guide',
        similarity: 0.95,
      },
      {
        id: 'chunk-2',
        content: 'Water your Monstera every 1-2 weeks.',
        source: 'care-tips',
        similarity: 0.88,
      },
    ]

    const formattedContext =
      'Monstera plants prefer bright indirect light.\nWater your Monstera every 1-2 weeks.'

    const layer = Layer.succeed(
      // The RagService mock needs to return formatted context
      (await import('@lily/api/services/rag/service')).RagService,
      {
        retrieve: () => Effect.succeed(mockChunks),
        formatContext: () => formattedContext,
      } as never
    )

    const result = await Effect.runPromise(
      askPlantQuestionEffect({ question: 'How to care for Monstera?' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result).toContain('Monstera plants prefer bright indirect light')
  })

  it('should return no results message when no chunks found', async () => {
    const layer = createMockRagService({ chunks: [] })

    const result = await Effect.runPromise(
      askPlantQuestionEffect({ question: 'obscure question' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result).toContain('No relevant information found')
  })

  it('should include plant name in query when provided', async () => {
    let capturedQuery = ''

    const layer = Layer.succeed(
      (await import('@lily/api/services/rag/service')).RagService,
      {
        retrieve: (params: { query: string }) => {
          capturedQuery = params.query
          return Effect.succeed([])
        },
        formatContext: () => '',
      } as never
    )

    await Effect.runPromise(
      askPlantQuestionEffect({
        question: 'How often to water?',
        plantName: 'Monstera',
      }).pipe(Effect.provide(layer))
    )

    expect(capturedQuery).toContain('Monstera')
    expect(capturedQuery).toContain('How often to water?')
  })
})
