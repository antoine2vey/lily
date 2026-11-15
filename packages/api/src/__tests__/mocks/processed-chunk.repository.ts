import {
  type IProcessedChunkRepository,
  ProcessedChunkRepository,
} from '@lily/api/repositories/processed-chunk.repository'
import type { CreateChunkData } from '@lily/api/repositories/raw-document.repository'
import type { ChunkSearchResult } from '@lily/shared/knowledge'
import { Effect, Layer } from 'effect'

export const createMockProcessedChunkRepository = (data: {
  insertedChunks: CreateChunkData[]
  searchResults?: ChunkSearchResult[]
  sourceBreakdown?: { source: string; count: number }[]
}): Layer.Layer<ProcessedChunkRepository> => {
  const repo: IProcessedChunkRepository = {
    search: () => Effect.succeed(data.searchResults ?? []),

    count: () => Effect.succeed(data.insertedChunks.length),

    countBySource: () => Effect.succeed(data.sourceBreakdown ?? []),

    countByJobId: () => Effect.succeed(data.insertedChunks.length),
  }

  return Layer.succeed(ProcessedChunkRepository, repo)
}
