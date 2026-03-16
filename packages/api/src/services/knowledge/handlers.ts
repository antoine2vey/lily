import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import type { KnowledgeQueryRequest } from '@lily/api/services/knowledge/api'
import { RagService } from '@lily/api/services/rag/service'
import { Array, Effect, Option, pipe } from 'effect'

const queryKnowledge = (params: KnowledgeQueryRequest) =>
  Effect.gen(function* () {
    const ragService = yield* RagService

    const query = pipe(
      Option.fromNullable(params.plantName),
      Option.match({
        onNone: () => params.question,
        onSome: (name) => `${name}: ${params.question}`,
      })
    )

    const chunks = yield* ragService.retrieve({ query, limit: 5 })
    const answer = ragService.formatContext(chunks)

    const sources = Array.map(chunks, (chunk) => ({
      title: chunk.source,
      content: chunk.content,
      similarity: chunk.similarity,
    }))

    return {
      answer: answer || 'No relevant information found.',
      sources,
    }
  }).pipe(Effect.withSpan('KnowledgeService.queryKnowledge'))

export const KnowledgeApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'knowledge', (handlers) =>
    handlers.handle('queryKnowledge', ({ payload }) =>
      queryKnowledge(payload).pipe(withInfraErrorsAsDefect)
    )
  )
