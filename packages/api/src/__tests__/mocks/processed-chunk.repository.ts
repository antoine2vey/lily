import {
  type CreateProcessedChunkData,
  type IProcessedChunkRepository,
  ProcessedChunkRepository,
} from '@lily/api/repositories/processed-chunk.repository'
import type { ChunkSearchResult } from '@lily/shared/knowledge'
import { Effect, Layer } from 'effect'

export const createMockProcessedChunkRepository = (data: {
  insertedChunks: CreateProcessedChunkData[]
  searchResults?: ChunkSearchResult[]
  sourceBreakdown?: { source: string; count: number }[]
}): Layer.Layer<ProcessedChunkRepository> => {
  const repo: IProcessedChunkRepository = {
    create: (chunk: CreateProcessedChunkData) => {
      data.insertedChunks.push(chunk)
      return Effect.succeed(undefined as void)
    },

    createMany: (chunks: CreateProcessedChunkData[]) => {
      for (const chunk of chunks) {
        data.insertedChunks.push(chunk)
      }
      return Effect.succeed(undefined as void)
    },

    search: () => Effect.succeed(data.searchResults ?? []),

    count: () => Effect.succeed(data.insertedChunks.length),

    countBySource: () => Effect.succeed(data.sourceBreakdown ?? []),

    countByJobId: () => Effect.succeed(data.insertedChunks.length),
  }

  return Layer.succeed(ProcessedChunkRepository, repo)
}
