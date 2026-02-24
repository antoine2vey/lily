import { ProcessedChunkRepository } from '@lily/api/repositories/processed-chunk.repository'
import type { ChunkSearchResult } from '@lily/shared/knowledge'
import { Array, Effect, Match, Option, pipe } from 'effect'
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

          const chunks = yield* chunkRepo.search({
            embedding,
            plantType: params.plantType,
            limit: params.limit ?? 5,
            minSimilarity: 0.5,
          })

          return chunks
        }).pipe(
          Effect.catchAll((error) =>
            Effect.gen(function* () {
              yield* Effect.logWarning(
                'RAG retrieval failed, continuing without knowledge context',
                {
                  error: String(error),
                  query: params.query,
                }
              )
              return [] as ChunkSearchResult[]
            })
          ),
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

        const sections = pipe(
          chunks,
          Array.map((chunk) => {
            const similarity = Math.round(chunk.similarity * 100)
            const meta = (chunk.metadata ?? {}) as {
              chunkType?: string
              subreddit?: string
            }

            return pipe(
              Match.value(meta.chunkType),
              Match.when('reddit_thread', () => {
                const subreddit = Option.getOrElse(
                  Option.fromNullable(meta.subreddit),
                  () => 'plantclinic'
                )
                return `### Plant Care Q&A (r/${subreddit}, ${similarity}% match)\n${chunk.content}`
              }),
              Match.when('reddit_question_only', () => {
                const subreddit = Option.getOrElse(
                  Option.fromNullable(meta.subreddit),
                  () => 'plantclinic'
                )
                return `### Plant Care Question (r/${subreddit}, ${similarity}% match)\n${chunk.content}`
              }),
              Match.orElse(
                () =>
                  `### Knowledge Source (${chunk.source}, ${similarity}% relevance)\n${chunk.content}`
              )
            )
          }),
          Array.join('\n\n')
        )

        return `## Relevant Plant Care Knowledge\nUse the following knowledge base excerpts to inform your advice when relevant. Do not mention these sources explicitly to the user.\n\n${sections}`
      },
    }
  }),
}) {}
