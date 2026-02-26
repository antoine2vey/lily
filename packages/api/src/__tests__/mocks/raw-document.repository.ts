import {
  type CreateRawDocumentData,
  type IRawDocumentRepository,
  RawDocumentRepository,
} from '@lily/api/repositories/raw-document.repository'
import type { RawDocument } from '@lily/shared/knowledge'
import { Array, Effect, Layer, Option, pipe } from 'effect'

export const createMockRawDocumentRepository = (data: {
  documents: RawDocument[]
}): Layer.Layer<RawDocumentRepository> => {
  const repo: IRawDocumentRepository = {
    create: (input: CreateRawDocumentData) => {
      const doc: RawDocument = {
        id: `doc-${crypto.randomUUID()}`,
        source: input.source,
        sourceUrl: input.sourceUrl,
        sourceId: input.sourceId,
        title: input.title,
        content: input.content,
        author: input.author,
        score: input.score,
        metadata: input.metadata,
        ingestJobId: input.ingestJobId,
        fetchedAt: new Date(),
      }
      data.documents.push(doc)
      return Effect.succeed(doc)
    },

    findBySourceId: (sourceId: string) =>
      Effect.succeed(
        pipe(
          Array.findFirst(data.documents, (d) => d.sourceId === sourceId),
          Option.getOrNull
        )
      ),

    countByJobId: (jobId: string) =>
      Effect.succeed(
        Array.length(
          Array.filter(data.documents, (d) => d.ingestJobId === jobId)
        )
      ),
  }

  return Layer.succeed(RawDocumentRepository, repo)
}
