import { DeadLetterRepository } from '@lily/api/repositories/dead-letter.repository'
import { IngestJobRepository } from '@lily/api/repositories/ingest-job.repository'
import {
  type CreateProcessedChunkData,
  ProcessedChunkRepository,
} from '@lily/api/repositories/processed-chunk.repository'
import { RawDocumentRepository } from '@lily/api/repositories/raw-document.repository'
import { getAdapter } from '@lily/api/services/knowledge-ingestion/adapters'
import type { RedditCommentData } from '@lily/api/services/knowledge-ingestion/adapters/reddit.adapter'
import type { RawDocumentInput } from '@lily/api/services/knowledge-ingestion/adapters/types'
import { categorize } from '@lily/api/services/knowledge-ingestion/processing/categorizer'
import { chunkContent } from '@lily/api/services/knowledge-ingestion/processing/chunker'
import { enrichChunk } from '@lily/api/services/knowledge-ingestion/processing/enrichment'
import { extractPlantMentions } from '@lily/api/services/knowledge-ingestion/processing/plant-extractor'
import { chunkRedditDocument } from '@lily/api/services/knowledge-ingestion/processing/reddit-chunker'
import { embedTexts } from '@lily/api/services/rag/embedding.service'
import type {
  AdapterConfig,
  IngestJob,
  RawDocument,
} from '@lily/shared/knowledge'
import { Array, Effect, Match, Option, pipe, Record, Ref, Stream } from 'effect'

interface ChunkInput {
  readonly content: string
  readonly metadata: Record<string, unknown> | undefined
}

interface ChunkDocumentResult {
  readonly parent?: ChunkInput
  readonly children: ChunkInput[]
}

export const chunkDocumentWithParent = (
  doc: RawDocument
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
        Option.fromNullable(result.parent),
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
 * Process a single document: deduplicate, store, chunk, enrich, embed, and insert chunks.
 * Returns the number of chunks created, or 0 if the document was a duplicate.
 */
const processDocument = (doc: RawDocumentInput, jobId: string) =>
  Effect.gen(function* () {
    const docRepo = yield* RawDocumentRepository
    const chunkRepo = yield* ProcessedChunkRepository

    // Skip duplicates by sourceId
    if (doc.sourceId) {
      const existing = yield* docRepo.findBySourceId(doc.sourceId)
      if (existing) {
        return { inserted: false, chunksCreated: 0 } as const
      }
    }

    // Store raw document
    const insertedDoc = yield* docRepo.create({
      ...doc,
      ingestJobId: jobId,
    })

    // Chunk content with parent-child structure
    const chunkResult = chunkDocumentWithParent(insertedDoc)

    if (Array.isEmptyArray(chunkResult.children)) {
      return { inserted: true, chunksCreated: 0 } as const
    }

    // Insert parent if present (no embedding — stored for LLM context only)
    const parentId = yield* pipe(
      Option.fromNullable(chunkResult.parent),
      Option.match({
        onNone: () => Effect.succeed(undefined as string | undefined),
        onSome: (parent) =>
          Effect.gen(function* () {
            const id = crypto.randomUUID()
            const plantMentions = extractPlantMentions(parent.content)
            yield* chunkRepo.create({
              id,
              documentId: insertedDoc.id,
              content: parent.content,
              chunkIndex: 0,
              source: insertedDoc.source,
              plantType: pipe(Array.head(plantMentions), Option.getOrUndefined),
              category: categorize(parent.content),
              plantMentions,
              metadata: parent.metadata,
              embedding: undefined,
            })
            return id as string | undefined
          }),
      })
    )

    // Enrich child chunks with keywords, up to 5 in parallel
    const enrichedChildren = yield* Effect.forEach(
      chunkResult.children,
      (child) =>
        Effect.gen(function* () {
          const enrichment = yield* enrichChunk(child.content).pipe(
            Effect.catchTag('EnrichmentError', (error) =>
              Effect.gen(function* () {
                const dlqRepo = yield* DeadLetterRepository
                yield* dlqRepo
                  .create({
                    originalMessageId: `${jobId}:${insertedDoc.id}:${child.content.slice(0, 32)}`,
                    topic: 'enrichment.chunk_failed',
                    payload: {
                      ingestJobId: jobId,
                      documentId: insertedDoc.id,
                      chunkContent: child.content,
                    },
                    error: error.message,
                    retryCount: 3,
                  })
                  .pipe(Effect.ignore)
                return undefined
              })
            )
          )

          return pipe(
            Option.fromNullable(enrichment),
            Option.match({
              onNone: () => ({
                content: child.content,
                embeddingContent: undefined as string | undefined,
                metadata: child.metadata,
              }),
              onSome: (e) => ({
                content: child.content,
                embeddingContent: `keywords: ${Array.join(e.keywords, ', ')}\n\n${child.content}`,
                metadata: pipe(
                  Array.appendAll(Record.toEntries(child.metadata ?? {}), [
                    ['keywords', e.keywords],
                  ] as [string, unknown][]),
                  Record.fromEntries
                ),
              }),
            })
          )
        }),
      { concurrency: 5 }
    )

    // Extract metadata for each child chunk
    const childData = Array.map(enrichedChildren, (child, index) => {
      const plantMentions = extractPlantMentions(child.content)
      return {
        ...child,
        chunkIndex: index,
        source: insertedDoc.source,
        plantType: pipe(Array.head(plantMentions), Option.getOrUndefined),
        category: categorize(child.content),
        plantMentions,
      }
    })

    // Batch embed all chunks in one request
    const texts = Array.map(childData, (c) => c.embeddingContent ?? c.content)
    const embeddings = yield* embedTexts(texts).pipe(
      Effect.catchTag('EmbeddingError', (error) =>
        Effect.logWarning(
          'Embedding failed for batch, storing without embeddings',
          { error: error.message, documentId: insertedDoc.id }
        ).pipe(Effect.map(() => Array.map(texts, () => undefined)))
      )
    )

    // Insert all chunks in one statement
    const chunksToInsert: CreateProcessedChunkData[] = pipe(
      childData,
      Array.map((child, i) => ({
        documentId: insertedDoc.id,
        parentChunkId: parentId,
        content: child.content,
        embeddingContent: child.embeddingContent,
        chunkIndex: child.chunkIndex,
        source: child.source,
        plantType: child.plantType,
        category: child.category,
        plantMentions: child.plantMentions,
        metadata: child.metadata,
        embedding: pipe(Array.get(embeddings, i), Option.getOrUndefined) as
          | number[]
          | undefined,
      }))
    )

    yield* chunkRepo.createMany(chunksToInsert)

    return { inserted: true, chunksCreated: chunksToInsert.length } as const
  })

/**
 * Process a single ingest job:
 * 1. Fetch documents via adapter
 * 2. For each document: deduplicate, store, chunk, enrich, embed, store chunks
 * 3. Update job counts incrementally
 *
 * Documents are processed one by one so that if the job crashes,
 * previously processed documents and their chunks are already persisted.
 */
export const processIngestJob = (job: IngestJob) =>
  Effect.gen(function* () {
    const jobRepo = yield* IngestJobRepository

    // Mark as in progress
    yield* jobRepo.updateStatus(job.id, 'in_progress')

    // 1. Stream documents from adapter and process each one immediately
    const adapter = yield* getAdapter(job.adapter)
    const docStream = adapter.fetch(job.config as AdapterConfig)

    const totalInsertedRef = yield* Ref.make(0)
    const totalChunksRef = yield* Ref.make(0)

    yield* Stream.runForEach(docStream, (doc) =>
      Effect.gen(function* () {
        const result = yield* processDocument(doc, job.id)

        if (result.inserted) {
          const inserted = yield* Ref.updateAndGet(
            totalInsertedRef,
            (n) => n + 1
          )
          const chunks = yield* Ref.updateAndGet(
            totalChunksRef,
            (n) => n + result.chunksCreated
          )

          yield* jobRepo.updateStatus(job.id, 'in_progress', {
            documentsFetched: inserted,
            chunksCreated: chunks,
          })
        }
      })
    )

    // 2. Mark job as completed
    const finalInserted = yield* Ref.get(totalInsertedRef)
    const finalChunks = yield* Ref.get(totalChunksRef)

    yield* jobRepo.updateStatus(job.id, 'completed', {
      documentsFetched: finalInserted,
      chunksCreated: finalChunks,
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
