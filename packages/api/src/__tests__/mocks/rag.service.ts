import { RagService } from '@lily/api/services/rag/service'
import type { ChunkSearchResult } from '@lily/shared/knowledge'
import { Array, Effect, Layer } from 'effect'

interface MockRagServiceData {
  chunks?: ChunkSearchResult[]
}

export const createMockRagService = (
  data: MockRagServiceData = {}
): Layer.Layer<RagService> => {
  const chunks = data.chunks ?? []

  return Layer.succeed(RagService, {
    retrieve: () => Effect.succeed(chunks),
    formatContext: (inputChunks: ChunkSearchResult[]) =>
      Array.isEmptyArray(inputChunks)
        ? ''
        : inputChunks
            .map((c: ChunkSearchResult) => `[${c.source}]: ${c.content}`)
            .join('\n'),
  } as unknown as typeof RagService.Service)
}

export const MockRagServiceLive = createMockRagService()
