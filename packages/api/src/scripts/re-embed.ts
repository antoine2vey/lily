/**
 * Re-chunk and re-embed all knowledge data.
 *
 * 1. Deletes all processed_chunks
 * 2. Reads all raw_documents
 * 3. Re-chunks with source-aware dispatch (reddit → thread chunker, other → generic)
 * 4. AI-enriches each chunk (keywords + summary via gpt-4o-mini)
 * 5. Embeds with the current embedding model using enriched text
 * 6. Inserts new chunks with metadata
 *
 * Usage:
 *   cd packages/api && bun run src/scripts/re-embed.ts --confirm
 *
 * Requires KNOWLEDGE_DATABASE_URL and OPENAI_API_KEY env vars.
 * --confirm is required to prevent accidental data loss.
 */

import { categorize } from '@lily/api/services/knowledge-ingestion/processing/categorizer'
import { enrichChunk } from '@lily/api/services/knowledge-ingestion/processing/enrichment'
import {
  extractPlantMentions,
  extractPrimaryPlantType,
} from '@lily/api/services/knowledge-ingestion/processing/plant-extractor'
import { chunkDocument } from '@lily/api/services/knowledge-ingestion/processor'
import { embedTexts } from '@lily/api/services/rag/embedding.service'
import {
  KnowledgeDrizzle,
  KnowledgeDrizzleLive,
  processedChunks,
  rawDocuments,
} from '@lily/knowledge-db'
import type { ContentCategory, RawDocument } from '@lily/shared/knowledge'
import { Array, Effect, Option, pipe, Record, Ref } from 'effect'

const EMBED_BATCH_SIZE = 50

const reChunkAndEmbed = Effect.gen(function* () {
  // Guard: require --confirm to prevent accidental deletion of all processed_chunks
  const args = Array.drop(process.argv, 2)
  if (!Array.contains(args, '--confirm')) {
    yield* Effect.logError(
      'Refusing to run: this script DELETES all processed_chunks.\n  Usage: bun run src/scripts/re-embed.ts --confirm'
    )
    return yield* Effect.fail(new Error('missing --confirm flag'))
  }

  const db = yield* KnowledgeDrizzle

  // 1. Delete all existing chunks
  yield* Effect.tryPromise(() => db.delete(processedChunks))
  yield* Effect.log('Deleted all existing chunks')

  // 2. Load all raw documents
  const docs = yield* Effect.tryPromise(() =>
    db
      .select({
        id: rawDocuments.id,
        content: rawDocuments.content,
        source: rawDocuments.source,
        title: rawDocuments.title,
        score: rawDocuments.score,
        metadata: rawDocuments.metadata,
        sourceUrl: rawDocuments.sourceUrl,
        sourceId: rawDocuments.sourceId,
        author: rawDocuments.author,
        ingestJobId: rawDocuments.ingestJobId,
        fetchedAt: rawDocuments.fetchedAt,
      })
      .from(rawDocuments)
  )
  yield* Effect.log(`Found ${docs.length} raw documents to re-chunk`)

  // 3. Re-chunk all documents using the shared chunkDocument from processor.ts
  const allChunks = pipe(
    docs,
    Array.flatMap((doc) =>
      pipe(
        chunkDocument(doc as unknown as RawDocument),
        Array.map((chunk, i) => ({
          documentId: doc.id,
          content: chunk.content,
          embeddingText: chunk.embeddingText,
          chunkIndex: i,
          source: doc.source,
          metadata: chunk.metadata,
        }))
      )
    )
  )
  yield* Effect.log(`Re-chunked into ${allChunks.length} chunks`)

  // 4. AI-enrich each chunk immutably
  yield* Effect.log('Starting AI enrichment...')
  const enrichedChunks = yield* Effect.forEach(allChunks, (chunk) =>
    enrichChunk(chunk.content).pipe(
      Effect.map((enrichment) => ({
        ...chunk,
        embeddingText: enrichment.summary,
        metadata: pipe(
          Array.appendAll(Record.toEntries(chunk.metadata ?? {}), [
            ['keywords', enrichment.keywords],
            ['summary', enrichment.summary],
          ] as [string, unknown][]),
          Record.fromEntries
        ),
      })),
      Effect.catchAll(() => Effect.succeed(chunk))
    )
  )

  const enrichedCount = Array.filter(
    enrichedChunks,
    (c) => c.metadata !== undefined && 'summary' in (c.metadata ?? {})
  ).length
  yield* Effect.log(`Enriched ${enrichedCount}/${enrichedChunks.length} chunks`)

  // 5. Embed and insert in batches
  const batches = Array.chunksOf(enrichedChunks, EMBED_BATCH_SIZE)
  const insertedRef = yield* Ref.make(0)

  yield* Effect.forEach(batches, (batch) =>
    Effect.gen(function* () {
      const texts = Array.map(batch, (c) => c.embeddingText)
      const embeddings = yield* embedTexts(texts)

      const values = pipe(
        Array.zip(batch, embeddings),
        Array.map(([chunk, embedding]) => ({
          documentId: chunk.documentId,
          content: chunk.content,
          chunkIndex: chunk.chunkIndex,
          source: chunk.source,
          plantType: Option.getOrNull(
            Option.fromNullable(extractPrimaryPlantType(chunk.content))
          ),
          category: Option.getOrNull(
            Option.fromNullable(categorize(chunk.content))
          ) as ContentCategory | null,
          plantMentions: Option.getOrNull(
            Option.fromNullable(extractPlantMentions(chunk.content))
          ),
          metadata: Option.getOrNull(Option.fromNullable(chunk.metadata)),
          embedding,
        }))
      )

      yield* Effect.tryPromise(() => db.insert(processedChunks).values(values))

      const total = yield* Ref.updateAndGet(
        insertedRef,
        (n) => n + batch.length
      )
      yield* Effect.log(
        `Progress: ${total}/${enrichedChunks.length} chunks embedded and inserted`
      )
    })
  )

  const finalCount = yield* Ref.get(insertedRef)
  yield* Effect.log(`Done! ${finalCount} chunks created.`)
})

const program = reChunkAndEmbed.pipe(
  Effect.provide(KnowledgeDrizzleLive),
  Effect.catchAll((error) =>
    Effect.logError(`Re-chunk failed: ${globalThis.String(error)}`)
  )
)

Effect.runPromise(program)
