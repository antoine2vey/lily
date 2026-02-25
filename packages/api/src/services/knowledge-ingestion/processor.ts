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
import {
  extractPlantMentions,
  extractPrimaryPlantType,
} from '@lily/api/services/knowledge-ingestion/processing/plant-extractor'
import { chunkRedditDocument } from '@lily/api/services/knowledge-ingestion/processing/reddit-chunker'
import { embedTexts } from '@lily/api/services/rag/embedding.service'
import type {
  AdapterConfig,
  IngestJob,
  RawDocument,
} from '@lily/shared/knowledge'
import { Array, Effect, Match, Option, pipe, Record, Ref, Stream } from 'effect'

interface ProcessedChunkInput {
  readonly content: string
  readonly embeddingText: string
  readonly metadata: Record<string, unknown> | undefined
}

export const chunkDocument = (doc: RawDocument): ProcessedChunkInput[] =>
  pipe(
    Match.value(doc.source),
    Match.when('reddit', () => {
      const meta = (doc.metadata ?? {}) as {
        subreddit?: string
        postScore?: number
        comments?: RedditCommentData[]
      }
      const chunk = chunkRedditDocument({
        title: doc.title,
        content: doc.content,
        postScore: meta.postScore ?? doc.score ?? 0,
        subreddit: meta.subreddit ?? 'unknown',
        comments: meta.comments ?? [],
      })
      return [chunk]
    }),
    Match.orElse(() =>
      pipe(
        chunkContent(doc.content),
        Array.map(
          (text): ProcessedChunkInput => ({
            content: text,
            embeddingText: text,
            metadata: undefined,
          })
        )
      )
    )
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

    // Chunk content (source-aware dispatch)
    const rawChunks = chunkDocument(insertedDoc)

    if (Array.isEmptyArray(rawChunks)) {
      return { inserted: true, chunksCreated: 0 } as const
    }

    // AI enrichment
    const enrichedChunks = yield* Effect.forEach(rawChunks, (chunk) =>
      Effect.gen(function* () {
        const enrichment = yield* enrichChunk(chunk.content).pipe(
          Effect.catchAll((error) =>
            Effect.logWarning('Chunk enrichment failed, continuing without', {
              error: String(error),
            }).pipe(Effect.map(() => undefined))
          )
        )

        return pipe(
          Option.fromNullable(enrichment),
          Option.match({
            onNone: () => chunk,
            onSome: (e) => ({
              content: chunk.content,
              embeddingText: e.summary,
              metadata: pipe(
                Array.appendAll(Record.toEntries(chunk.metadata ?? {}), [
                  ['keywords', e.keywords],
                  ['summary', e.summary],
                ] as [string, unknown][]),
                Record.fromEntries
              ),
            }),
          })
        )
      })
    )

    // Extract metadata for each chunk
    const chunkData = Array.map(enrichedChunks, (chunk, index) => ({
      ...chunk,
      chunkIndex: index,
      source: insertedDoc.source,
      plantType: extractPrimaryPlantType(chunk.content),
      category: categorize(chunk.content),
      plantMentions: extractPlantMentions(chunk.content),
    }))

    // Generate embeddings in batch (using embeddingText, not content)
    const texts = Array.map(chunkData, (c) => c.embeddingText)
    const embeddings = yield* embedTexts(texts).pipe(
      Effect.catchAll((error) =>
        Effect.logWarning(
          'Embedding failed for batch, storing without embeddings',
          { error: String(error), documentId: insertedDoc.id }
        ).pipe(Effect.map(() => Array.map(texts, () => undefined)))
      )
    )

    // Store chunks
    const chunksToInsert: CreateProcessedChunkData[] = pipe(
      chunkData,
      Array.map((chunk, i) => ({
        documentId: insertedDoc.id,
        content: chunk.content,
        chunkIndex: chunk.chunkIndex,
        source: chunk.source,
        plantType: chunk.plantType,
        category: chunk.category,
        plantMentions: chunk.plantMentions,
        metadata: chunk.metadata,
        embedding: pipe(Array.get(embeddings, i), Option.getOrUndefined) as
          | number[]
          | undefined,
      }))
    )

    yield* chunkRepo.createMany(chunksToInsert).pipe(
      Effect.tapError((error) =>
        Effect.logError('Failed to insert chunks', {
          error: String(error),
          documentId: insertedDoc.id,
          chunkCount: chunksToInsert.length,
        })
      )
    )

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

    yield* Effect.log(
      `Job ${job.id} completed: ${finalInserted} docs, ${finalChunks} chunks`
    )
  }).pipe(
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        const jobRepo = yield* IngestJobRepository
        yield* jobRepo.updateError(job.id, String(error))
        yield* Effect.logError(`Job ${job.id} failed`, {
          error: String(error),
        })
      })
    ),
    Effect.withSpan('KnowledgeIngestion.processJob', {
      attributes: { 'job.id': job.id, 'job.adapter': job.adapter },
    })
  )
