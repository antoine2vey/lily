import { ProcessedChunkRepository } from '@lily/api/repositories/processed-chunk.repository'
import type { ChunkSearchResult } from '@lily/shared/knowledge'
import { Array, Effect, Match, Option, pipe, String } from 'effect'
import { embedText } from './embedding.service'

export interface RagRetrieveParams {
  query: string
  plantType?: string | undefined
  limit?: number | undefined
}

export class RagService extends Effect.Service<RagService>()('RagService', {
  effect: Effect.gen(function* () {
    const chunkRepo = yield* ProcessedChunkRepository

    return {
      /**
       * Retrieve relevant knowledge chunks for a query.
       * Gracefully returns empty array if retrieval fails.
       */
      retrieve: (params: RagRetrieveParams) =>
        Effect.gen(function* () {
          const embedding = yield* embedText(params.query)
          const limit = Option.getOrElse(
            Option.fromNullable(params.limit),
            () => 5
          )

          return yield* chunkRepo.search({
            embedding,
            queryText: params.query,
            plantType: params.plantType,
            limit,
            minSimilarity: 0.6,
          })
        }).pipe(
          Effect.catchTags({
            EmbeddingError: (error) =>
              Effect.logWarning(
                'RAG retrieval failed, continuing without knowledge context',
                { error: globalThis.String(error), query: params.query }
              ).pipe(Effect.as([] as ChunkSearchResult[])),
            SqlError: (error) =>
              Effect.logWarning(
                'RAG retrieval failed, continuing without knowledge context',
                { error: globalThis.String(error), query: params.query }
              ).pipe(Effect.as([] as ChunkSearchResult[])),
          }),
          Effect.withSpan('RagService.retrieve', {
            attributes: { 'rag.query': params.query },
          })
        ),

      /**
       * Format retrieved chunks as markdown context for the system prompt.
       */
      formatContext: (chunks: ChunkSearchResult[]) => {
        if (Array.isEmptyArray(chunks)) {
          return ''
        }

        const urlOnlyLine = /^\s*(\[\d+ upvotes\]\s+)?https?:\/\/\S+\s*$/

        const cleanContent = (content: string) =>
          pipe(
            String.split(content, '\n'),
            Array.filter((line) => !urlOnlyLine.test(line)),
            Array.join('\n'),
            String.replace(/\n{3,}/g, '\n\n'),
            String.trim
          )

        const sections = pipe(
          chunks,
          Array.map((chunk) => {
            const similarity = Math.round(chunk.similarity * 100)
            const meta = Option.getOrElse(
              Option.fromNullable(chunk.metadata),
              () => ({})
            ) as { chunkType?: string; subreddit?: string }
            const content = cleanContent(chunk.content)
            const subreddit = Option.getOrElse(
              Option.fromNullable(meta.subreddit),
              () => 'plantclinic'
            )

            return pipe(
              Match.value(meta.chunkType),
              Match.when(
                'reddit_thread',
                () =>
                  `### Plant Care Q&A (r/${subreddit}, ${similarity}% match)\n${content}`
              ),
              Match.when(
                'reddit_question_only',
                () =>
                  `### Plant Care Question (r/${subreddit}, ${similarity}% match)\n${content}`
              ),
              Match.orElse(
                () =>
                  `### Knowledge Source (${chunk.source}, ${similarity}% relevance)\n${content}`
              )
            )
          }),
          Array.join('\n\n')
        )

        return `## Relevant Plant Care Knowledge\nUse the following information to inform your advice. Synthesize it with your own knowledge — do not quote or reference these sources directly.\n\n${sections}`
      },
    }
  }),
}) {}
