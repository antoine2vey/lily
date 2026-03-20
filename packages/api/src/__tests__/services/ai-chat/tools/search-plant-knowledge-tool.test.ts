import { createMockDiagnosisRepository } from '@lily/api/__tests__/mocks/diagnosis.repository'
import { createMockRagService } from '@lily/api/__tests__/mocks/rag.service'
import type { ToolDeps } from '@lily/api/services/ai-chat/tools/index'
import { searchPlantKnowledgeTool } from '@lily/api/services/ai-chat/tools/search-plant-knowledge'
import type { RagService } from '@lily/api/services/rag/service'
import type { ChunkSearchResult } from '@lily/shared/knowledge'
import { Effect, Layer, ManagedRuntime } from 'effect'
import { describe, expect, it } from 'vitest'

const mockChunks: ChunkSearchResult[] = [
  {
    id: 'chunk-1',
    content: 'Water monstera weekly',
    source: 'plant-guide',
    similarity: 0.85,
  },
  {
    id: 'chunk-2',
    content: 'Monstera prefers indirect light',
    source: 'care-tips',
    similarity: 0.78,
  },
]

const diagStub = createMockDiagnosisRepository([])

const makeDeps = async (
  layer: Layer.Layer<any>
): Promise<{
  deps: ToolDeps
  cleanup: () => Promise<void>
}> => {
  const managedRuntime = ManagedRuntime.make(layer)
  const rt = await managedRuntime.runtime()
  return {
    deps: {
      runtime: rt,
      userId: 'user-1',
      plantId: 'plant-1',
      plantName: 'Monstera',
    },
    cleanup: () => managedRuntime.dispose(),
  }
}

describe('searchPlantKnowledgeTool', () => {
  it('returns formatted context when chunks are found', async () => {
    const layer = Layer.mergeAll(
      diagStub,
      createMockRagService({ chunks: mockChunks })
    )
    const { deps, cleanup } = await makeDeps(layer)

    const tool = searchPlantKnowledgeTool(deps)
    const result = await tool.execute!(
      { query: 'How often should I water?' },
      // @ts-expect-error - testing execute directly without AI options
      undefined
    )

    expect(result).toContain('Water monstera weekly')
    expect(result).toContain('Monstera prefers indirect light')
    await cleanup()
  })

  it('returns fallback message when no chunks are found', async () => {
    const layer = Layer.mergeAll(diagStub, createMockRagService({ chunks: [] }))
    const { deps, cleanup } = await makeDeps(layer)

    const tool = searchPlantKnowledgeTool(deps)
    const result = await tool.execute!(
      { query: 'Can I grow monstera outdoors?' },
      // @ts-expect-error - testing execute directly without AI options
      undefined
    )

    expect(result).toBe(
      'No relevant knowledge base articles found. Answer based on your own plant care expertise.'
    )
    await cleanup()
  })

  it('prepends plant name to the query sent to RagService', async () => {
    const retrieveCalls: string[] = []
    const spyLayer = Layer.succeed(
      (await import('@lily/api/services/rag/service')).RagService,
      {
        retrieve: ({ query }: { query: string }) => {
          retrieveCalls.push(query)
          return Effect.succeed(mockChunks)
        },
        formatContext: (chunks: ChunkSearchResult[]) =>
          chunks.map((c) => c.content).join('\n'),
      } as any
    )

    const layer = Layer.mergeAll(diagStub, spyLayer)
    const { deps, cleanup } = await makeDeps(layer)

    const tool = searchPlantKnowledgeTool(deps)
    await tool.execute!(
      { query: 'watering schedule' },
      // @ts-expect-error - testing execute directly without AI options
      undefined
    )

    // First query should be "Monstera: watering schedule"
    expect(retrieveCalls[0]).toBe('Monstera: watering schedule')
    await cleanup()
  })
})
