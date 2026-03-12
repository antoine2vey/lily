import { ApiClient } from '@lily/mcp/api-client'
import { Array, Effect, pipe } from 'effect'

/**
 * Queries the plant care knowledge base via the API's RAG endpoint.
 * Returns relevant knowledge that can answer plant care questions.
 */
export const askPlantQuestionEffect = (params: {
  question: string
  plantName?: string
}) =>
  Effect.gen(function* () {
    const apiClient = yield* ApiClient

    const result = yield* apiClient.queryKnowledge(
      params.question,
      params.plantName
    )

    if (Array.isEmptyArray(result.sources as unknown[])) {
      return 'No relevant information found in the knowledge base for this question. Try rephrasing your question or asking about common houseplant topics.'
    }

    // Build markdown from the answer and sources
    const sourceLines = pipe(
      result.sources,
      Array.map(
        (s) =>
          `- **${s.title}** (relevance: ${Math.round(s.similarity * 100)}%)\n  ${s.content}`
      )
    )

    return `${result.answer}\n\n### Sources\n${Array.join(sourceLines, '\n')}`
  }).pipe(Effect.withSpan('MCP.askPlantQuestion'))
