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
 *   cd packages/api && bun run src/scripts/re-embed.ts
 *
 * Requires KNOWLEDGE_DATABASE_URL and OPENAI_API_KEY env vars.
 */

import type { RedditCommentData } from '@lily/api/services/knowledge-ingestion/adapters/reddit.adapter'
import { categorize } from '@lily/api/services/knowledge-ingestion/processing/categorizer'
import { chunkContent } from '@lily/api/services/knowledge-ingestion/processing/chunker'
import { enrichChunk } from '@lily/api/services/knowledge-ingestion/processing/enrichment'
import {
  extractPlantMentions,
  extractPrimaryPlantType,
} from '@lily/api/services/knowledge-ingestion/processing/plant-extractor'
import { chunkRedditDocument } from '@lily/api/services/knowledge-ingestion/processing/reddit-chunker'
import { embedTexts } from '@lily/api/services/rag/embedding.service'
import {
  KnowledgeDrizzle,
  KnowledgeDrizzleLive,
  processedChunks,
  rawDocuments,
} from '@lily/knowledge-db'
import type { ContentCategory } from '@lily/shared/knowledge'
import { Array, Effect, Match, Option, pipe } from 'effect'

const EMBED_BATCH_SIZE = 50

interface ChunkInput {
  readonly content: string
  readonly embeddingText: string
  readonly metadata: Record<string, unknown> | undefined
}

const chunkDocumentBySource = (doc: {
  content: string
  source: string
  title: string
  score: number | null
  metadata: unknown
}): ChunkInput[] =>
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
          (text): ChunkInput => ({
            content: text,
            embeddingText: text,
            metadata: undefined,
          })
        )
      )
    )
  )

const reChunkAndEmbed = Effect.gen(function* () {
  const db = yield* KnowledgeDrizzle

  // 1. Delete all existing chunks
  yield* Effect.tryPromise(() => db.delete(processedChunks))
  yield* Effect.log('Deleted all existing chunks')

  // 2. Load all raw documents (including title, metadata, score for reddit dispatch)
  const docs = yield* Effect.tryPromise(() =>
    db
      .select({
        id: rawDocuments.id,
        content: rawDocuments.content,
        source: rawDocuments.source,
        title: rawDocuments.title,
        score: rawDocuments.score,
        metadata: rawDocuments.metadata,
      })
      .from(rawDocuments)
  )
  yield* Effect.log(`Found ${docs.length} raw documents to re-chunk`)

  // 3. Re-chunk all documents with source-aware dispatch
  const allChunks: {
    documentId: string
    content: string
    embeddingText: string
    chunkIndex: number
    source: string
    plantType: string | undefined
    category: string | undefined
    plantMentions: string[] | undefined
    metadata: Record<string, unknown> | undefined
  }[] = []

  for (const doc of docs) {
    const chunks = chunkDocumentBySource(doc)
    Array.forEach(chunks, (chunk, i) => {
      allChunks.push({
        documentId: doc.id,
        content: chunk.content,
        embeddingText: chunk.embeddingText,
        chunkIndex: i,
        source: doc.source,
        plantType: extractPrimaryPlantType(chunk.content),
        category: categorize(chunk.content),
        plantMentions: extractPlantMentions(chunk.content),
        metadata: chunk.metadata,
      })
    })
  }

  yield* Effect.log(`Re-chunked into ${allChunks.length} chunks`)

  // 4. AI-enrich each chunk
  yield* Effect.log('Starting AI enrichment...')
  let enriched = 0

  for (const [i, chunk] of allChunks.entries()) {
    const enrichment = yield* enrichChunk(chunk.content).pipe(
      Effect.catchAll(() => Effect.succeed(undefined))
    )

    if (enrichment) {
      allChunks[i] = {
        ...chunk,
        embeddingText: enrichment.summary,
        metadata: {
          ...chunk.metadata,
          keywords: enrichment.keywords,
          summary: enrichment.summary,
        },
      }
      enriched++
    }
  }

  yield* Effect.log(`Enriched ${enriched}/${allChunks.length} chunks`)

  // 5. Embed and insert in batches (using embeddingText)
  let inserted = 0

  for (let i = 0; i < allChunks.length; i += EMBED_BATCH_SIZE) {
    const batch = allChunks.slice(i, i + EMBED_BATCH_SIZE)
    const texts = Array.map(batch, (c) => c.embeddingText)
    const embeddings = yield* embedTexts(texts)

    const values = pipe(
      Array.zip(batch, embeddings),
      Array.map(([chunk, embedding]) => ({
        documentId: chunk.documentId,
        content: chunk.content,
        chunkIndex: chunk.chunkIndex,
        source: chunk.source,
        plantType: Option.getOrNull(Option.fromNullable(chunk.plantType)),
        category: Option.getOrNull(
          Option.fromNullable(chunk.category)
        ) as ContentCategory | null,
        plantMentions: Option.getOrNull(
          Option.fromNullable(chunk.plantMentions)
        ),
        metadata: Option.getOrNull(Option.fromNullable(chunk.metadata)),
        embedding,
      }))
    )

    yield* Effect.tryPromise(() => db.insert(processedChunks).values(values))

    inserted += batch.length
    yield* Effect.log(
      `Progress: ${inserted}/${allChunks.length} chunks embedded and inserted`
    )
  }

  yield* Effect.log(`Done! ${inserted} chunks created.`)
})

const program = reChunkAndEmbed.pipe(
  Effect.provide(KnowledgeDrizzleLive),
  Effect.catchAll((error) =>
    Effect.logError(`Re-chunk failed: ${globalThis.String(error)}`)
  )
)

Effect.runPromise(program)
