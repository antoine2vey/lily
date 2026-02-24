import { IngestJobRepository } from '@lily/api/repositories/ingest-job.repository'
import {
  type CreateProcessedChunkData,
  ProcessedChunkRepository,
} from '@lily/api/repositories/processed-chunk.repository'
import { RawDocumentRepository } from '@lily/api/repositories/raw-document.repository'
import { getAdapter } from '@lily/api/services/knowledge-ingestion/adapters'
import type { RawDocumentInput } from '@lily/api/services/knowledge-ingestion/adapters/types'
import { categorize } from '@lily/api/services/knowledge-ingestion/processing/categorizer'
import { chunkContent } from '@lily/api/services/knowledge-ingestion/processing/chunker'
import {
  extractPlantMentions,
  extractPrimaryPlantType,
} from '@lily/api/services/knowledge-ingestion/processing/plant-extractor'
import { embedTexts } from '@lily/api/services/rag/embedding.service'
import type { AdapterConfig, IngestJob } from '@lily/shared/knowledge'
import { Array, Effect, Option, pipe, Ref, Stream } from 'effect'

/**
 * Process a single document: deduplicate, store, chunk, embed, and insert chunks.
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

    // Chunk content
    const chunks = chunkContent(insertedDoc.content)

    if (Array.isEmptyArray(chunks)) {
      return { inserted: true, chunksCreated: 0 } as const
    }

    // Extract metadata for each chunk
    const chunkData = Array.map(chunks, (content, index) => ({
      content,
      chunkIndex: index,
      source: insertedDoc.source,
      plantType: extractPrimaryPlantType(content),
      category: categorize(content),
      plantMentions: extractPlantMentions(content),
    }))

    // Generate embeddings in batch
    const texts = Array.map(chunkData, (c) => c.content)
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
 * 2. For each document: deduplicate, store, chunk, embed, store chunks
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
