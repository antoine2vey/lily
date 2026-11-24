import {
  type IProcessedChunkRepository,
  ProcessedChunkRepository,
} from '@lily/api/repositories/processed-chunk.repository'
import type { CreateChunkData } from '@lily/api/repositories/raw-document.repository'
import type { ChunkSearchResult } from '@lily/shared/knowledge'
import { Array, Effect, Layer, Option, pipe } from 'effect'

export const createMockProcessedChunkRepository = (data: {
  insertedChunks: CreateChunkData[]
  searchResults?: ChunkSearchResult[]
  sourceBreakdown?: { source: string; count: number }[]
}): Layer.Layer<ProcessedChunkRepository> => {
  const repo: IProcessedChunkRepository = {
    search: () => Effect.succeed(data.searchResults ?? []),

    count: Effect.sync(() => data.insertedChunks.length),

    countBySource: Effect.sync(() => data.sourceBreakdown ?? []),

    findUnembedded: (limit) =>
      Effect.sync(() =>
        pipe(
          data.insertedChunks,
          Array.filter(
            (chunk) =>
              chunk.embedding === undefined &&
              !Array.some(
                data.insertedChunks,
                (other) =>
                  chunk.id !== undefined && other.parentChunkId === chunk.id
              )
          ),
          Array.take(limit),
          Array.map((chunk) => ({
            id: chunk.id ?? '',
            text: chunk.embeddingContent ?? chunk.content,
          }))
        )
      ),

    setEmbedding: (id, embedding) =>
      Effect.sync(() =>
        pipe(
          Array.findFirst(data.insertedChunks, (chunk) => chunk.id === id),
          Option.map((chunk) => {
            chunk.embedding = embedding
          }),
          Option.getOrUndefined
        )
      ),
  }

  return Layer.succeed(ProcessedChunkRepository, repo)
}
