import { RagService } from '@lily/api/services/rag/service'
import { Effect } from 'effect'

/**
 * Queries the plant care knowledge base using RAG retrieval.
 * Returns relevant knowledge chunks that can be used to answer
 * plant care questions.
 */
export const askPlantQuestionEffect = (params: {
  question: string
  plantName?: string
}) =>
  Effect.gen(function* () {
    const ragService = yield* RagService

    const query = params.plantName
      ? `${params.plantName}: ${params.question}`
      : params.question

    const chunks = yield* ragService.retrieve({
      query,
      limit: 5,
    })

    const context = ragService.formatContext(chunks)

    if (!context) {
      return 'No relevant information found in the knowledge base for this question. Try rephrasing your question or asking about common houseplant topics.'
    }

    return context
  }).pipe(Effect.withSpan('MCP.askPlantQuestion'))
