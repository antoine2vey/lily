import { DeadLetterRepository } from '@lily/api/repositories/dead-letter.repository'
import { IngestJobRepository } from '@lily/api/repositories/ingest-job.repository'
import {
  type CreateChunkData,
  RawDocumentRepository,
} from '@lily/api/repositories/raw-document.repository'
import { getAdapter } from '@lily/api/services/knowledge-ingestion/adapters'
import type { RedditCommentData } from '@lily/api/services/knowledge-ingestion/adapters/reddit.adapter'
import type { RawDocumentInput } from '@lily/api/services/knowledge-ingestion/adapters/types'
import { categorize } from '@lily/api/services/knowledge-ingestion/processing/categorizer'
import { chunkContent } from '@lily/api/services/knowledge-ingestion/processing/chunker'
import { enrichChunk } from '@lily/api/services/knowledge-ingestion/processing/enrichment'
import { extractPlantMentions } from '@lily/api/services/knowledge-ingestion/processing/plant-extractor'
import { chunkRedditDocument } from '@lily/api/services/knowledge-ingestion/processing/reddit-chunker'
import { embedTexts } from '@lily/api/services/rag/embedding.service'
import type { AdapterConfig, IngestJob } from '@lily/shared/knowledge'
import { Array, Effect, Match, Option, pipe, Record, Ref, Stream } from 'effect'

interface ChunkInput {
  readonly content: string
  readonly metadata: Record<string, unknown> | undefined
}

interface EnrichedChunk {
  readonly content: string
  readonly embeddingContent: string | undefined
  readonly metadata: Record<string, unknown> | undefined
  readonly enrichmentError: Option.Option<string>
}

interface ChunkDocumentResult {
  readonly parent?: ChunkInput
  readonly children: ChunkInput[]
}

export const chunkDocumentWithParent = (
  doc: RawDocumentInput
): ChunkDocumentResult =>
  pipe(
    Match.value(doc.source),
    Match.when('reddit', () => {
      const meta = (doc.metadata ?? {}) as {
        subreddit?: string
        postScore?: number
        comments?: RedditCommentData[]
      }
      const result = chunkRedditDocument({
        title: doc.title,
        content: doc.content,
        postScore: meta.postScore ?? doc.score ?? 0,
        subreddit: meta.subreddit ?? 'unknown',
        comments: meta.comments ?? [],
      })

      return pipe(
        Option.fromNullishOr(result.parent),
        Option.match({
          onNone: () => ({ children: result.children }),
          onSome: (parent) => ({ parent, children: result.children }),
        })
      )
    }),
    Match.orElse(() => {
      const chunks = chunkContent(doc.content)
      const chunkCount = Array.length(chunks)

      return pipe(
        Match.value(chunkCount),
        Match.when(0, () => ({ children: [] as ChunkInput[] })),
        Match.when(1, () => ({
          children: [
            {
              content: Option.getOrElse(Array.head(chunks), () => ''),
              metadata: undefined,
            },
          ] as ChunkInput[],
        })),
        Match.orElse(() => ({
          parent: { content: doc.content, metadata: undefined as undefined },
          children: Array.map(
            chunks,
            (text): ChunkInput => ({ content: text, metadata: undefined })
          ),
        }))
      )
    })
  )

/**
 * Process a single document: deduplicate, chunk, enrich, embed, then store the
 * document and its chunks in one statement.
 * Returns the number of chunks created, or 0 if the document was a duplicate.
 */
const processDocument = (doc: RawDocumentInput, jobId: string) =>
  Effect.gen(function* () {
    const docRepo = yield* RawDocumentRepository

    // Skip documents stored by an earlier job. A document stored by another
    // worker between this check and the insert is caught by createIfNew.
    if (doc.sourceId) {
      const existing = yield* docRepo.findBySourceId(doc.sourceId)
      if (existing) {
        return { inserted: false, chunksCreated: 0 } as const
      }
    }

    const document = { ...doc, ingestJobId: jobId }
    const chunkResult = chunkDocumentWithParent(doc)

    if (Array.isArrayEmpty(chunkResult.children)) {
      const stored = yield* docRepo.createIfNew(document, [])
      return { inserted: stored !== null, chunksCreated: 0 } as const
    }

    const parentChunk = pipe(
      Option.fromNullishOr(chunkResult.parent),
      Option.map((parent) => {
        const plantMentions = extractPlantMentions(parent.content)
        return {
          id: crypto.randomUUID(),
          content: parent.content,
          chunkIndex: 0,
          source: doc.source,
          plantType: pipe(Array.head(plantMentions), Option.getOrUndefined),
          category: categorize(parent.content),
          plantMentions,
          metadata: parent.metadata,
        }
      })
    )

    // Enrich child chunks with keywords, up to 5 in parallel
    const enrichedChildren = yield* Effect.forEach(
      chunkResult.children,
      (child) =>
        enrichChunk(child.content).pipe(
          Effect.map(
            (e): EnrichedChunk => ({
              content: child.content,
              embeddingContent: `keywords: ${Array.join(e.keywords, ', ')}\n\n${child.content}`,
              metadata: pipe(
                Array.appendAll(Record.toEntries(child.metadata ?? {}), [
                  ['keywords', e.keywords],
                ] as [string, unknown][]),
                Record.fromEntries
              ),
              enrichmentError: Option.none(),
            })
          ),
          Effect.catchTag(['EnrichmentError', 'OpenAIError'], (error) =>
            Effect.succeed<EnrichedChunk>({
              content: child.content,
              embeddingContent: undefined,
              metadata: child.metadata,
              enrichmentError: Option.some(error.message),
            })
          )
        ),
      { concurrency: 5 }
    )

    // Batch embed all chunks in one request
    const texts = Array.map(
      enrichedChildren,
      (c) => c.embeddingContent ?? c.content
    )
    const embeddings = yield* embedTexts(texts).pipe(
      Effect.catchTag('EmbeddingError', (error) =>
        Effect.logWarning(
          'Embedding failed for batch, storing without embeddings',
          { error: error.message, jobId, sourceId: doc.sourceId }
        ).pipe(Effect.map(() => Array.map(texts, () => undefined)))
      )
    )

    const parentChunkId = pipe(
      parentChunk,
      Option.map((parent) => parent.id),
      Option.getOrUndefined
    )
    const childChunks = Array.map(
      enrichedChildren,
      (child, index): CreateChunkData => {
        const plantMentions = extractPlantMentions(child.content)
        return {
          parentChunkId,
          content: child.content,
          embeddingContent: child.embeddingContent,
          chunkIndex: index,
          source: doc.source,
          plantType: pipe(Array.head(plantMentions), Option.getOrUndefined),
          category: categorize(child.content),
          plantMentions,
          metadata: child.metadata,
          embedding: pipe(
            Array.get(embeddings, index),
            Option.getOrUndefined
          ) as number[] | undefined,
        }
      }
    )

    const stored = yield* docRepo.createIfNew(document, [
      ...Option.toArray(parentChunk),
      ...childChunks,
    ])
    if (!stored) {
      return { inserted: false, chunksCreated: 0 } as const
    }

    const dlqRepo = yield* DeadLetterRepository
    yield* Effect.forEach(
      enrichedChildren,
      (child) =>
        Option.match(child.enrichmentError, {
          onNone: () => Effect.void,
          onSome: (error) =>
            dlqRepo
              .create({
                originalMessageId: `${jobId}:${stored.id}:${child.content.slice(0, 32)}`,
                topic: 'enrichment.chunk_failed',
                payload: {
                  ingestJobId: jobId,
                  documentId: stored.id,
                  chunkContent: child.content,
                },
                error,
                retryCount: 3,
              })
              .pipe(Effect.ignore),
        }),
      { discard: true }
    )

    return { inserted: true, chunksCreated: childChunks.length } as const
  })

/**
 * Process a job the worker has already claimed:
 * 1. Fetch documents via adapter
 * 2. For each document: deduplicate, chunk, enrich, embed, then store it whole
 * 3. Record progress after every document, which also refreshes the claim
 *
 * Documents are processed one by one so that if the job crashes,
 * previously processed documents and their chunks are already persisted.
 */
export const processIngestJob = (
  job: IngestJob
): Effect.Effect<
  void,
  never,
  IngestJobRepository | RawDocumentRepository | DeadLetterRepository
> =>
  Effect.gen(function* () {
    const jobRepo = yield* IngestJobRepository

    const adapter = yield* getAdapter(job.adapter)
    const docStream = adapter.fetch(job.config as AdapterConfig)

    const totalInsertedRef = yield* Ref.make(0)
    const totalChunksRef = yield* Ref.make(0)

    yield* Stream.runForEach(docStream, (doc) =>
      Effect.gen(function* () {
        const result = yield* processDocument(doc, job.id)

        if (result.inserted) {
          yield* Ref.update(totalInsertedRef, (n) => n + 1)
          yield* Ref.update(totalChunksRef, (n) => n + result.chunksCreated)
        }

        // Written for skipped documents too: a run of duplicates is still a
        // live worker, and the claim must not look abandoned.
        yield* jobRepo.recordProgress(job.id, {
          documentsFetched: yield* Ref.get(totalInsertedRef),
          chunksCreated: yield* Ref.get(totalChunksRef),
        })
      })
    )

    yield* jobRepo.complete(job.id, {
      documentsFetched: yield* Ref.get(totalInsertedRef),
      chunksCreated: yield* Ref.get(totalChunksRef),
    })
  }).pipe(
    Effect.catchTags({
      SqlError: (error) =>
        Effect.gen(function* () {
          const jobRepo = yield* IngestJobRepository
          const errorMessage = String(error)
          yield* jobRepo.updateError(job.id, errorMessage).pipe(Effect.orDie)
          yield* Effect.logError(`Job ${job.id} failed`, {
            error: errorMessage,
          })
        }),
      AdapterError: (error) =>
        Effect.gen(function* () {
          const jobRepo = yield* IngestJobRepository
          const errorMessage = error.message
          yield* jobRepo.updateError(job.id, errorMessage).pipe(Effect.orDie)
          yield* Effect.logError(`Job ${job.id} failed`, {
            error: errorMessage,
          })
        }),
    }),
    Effect.withSpan('KnowledgeIngestion.processJob', {
      attributes: { 'job.id': job.id, 'job.adapter': job.adapter },
    })
  )
