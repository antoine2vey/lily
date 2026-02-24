import { RagService } from '@lily/api/services/rag/service'
import type { ChunkSearchResult } from '@lily/shared/knowledge'
import { Effect, Layer } from 'effect'

export const createMockRagService = (
  opts: { chunks?: ChunkSearchResult[] } = {}
) => {
  const mockService = {
    retrieve: () => Effect.succeed(opts.chunks ?? []),
    formatContext: () => '',
  }

  return Layer.succeed(
    RagService,
    mockService as unknown as typeof RagService.Service
  )
}

export const MockRagServiceLive = createMockRagService()
