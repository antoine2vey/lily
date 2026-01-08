import type { SqlError } from '@effect/sql/SqlError'
import type { PgDrizzle } from '@effect/sql-drizzle/Pg'
import { EventBus, publishWithRetry } from '@lily/api/events'
import { ChatRepository } from '@lily/api/repositories/chat.repository'
import { Session } from '@lily/api/services/auth/session'
import type { ChatRequest, ChatResponse } from '@lily/shared/ai-chat'
import { AiService } from '@lily/shared/services/ai/service'
import type { UIMessage } from 'ai'
import { Effect, Stream } from 'effect'

export const sendChatMessage = (
  plantId: string,
  request: ChatRequest
): Effect.Effect<
  ChatResponse,
  Error | SqlError,
  ChatRepository | AiService | EventBus | Session | PgDrizzle
> =>
  Effect.gen(function* () {
    const chatRepo = yield* ChatRepository
    const aiService = yield* AiService
    const eventBus = yield* EventBus
    const { userId } = yield* Session

    const userMessage = request.message ?? ''

    // 1. Save user message to database
    const savedUserMessage = yield* chatRepo.create({
      role: 'user',
      content: userMessage,
      imageUrl: undefined,
      plantId,
      userId,
    })

    if (!savedUserMessage) {
      return yield* Effect.fail(new Error('Failed to save user message'))
    }

    // 2. Load chat history from database (get all messages without pagination)
    const historyResult = yield* chatRepo.findByPlantId({
      plantId,
      userId,
      limit: 100, // Get last 100 messages for context
    })

    // 3. Convert to UIMessage[] format for AI SDK
    const uiMessages: UIMessage[] = historyResult.items.map((msg) => ({
      id: msg.id,
      role: msg.role as 'user' | 'assistant',
      parts: [{ type: 'text' as const, text: msg.content }],
    }))

    // 4. Call AI service with history context
    const textStream = yield* aiService.plantChat(plantId, uiMessages)

    // 5. Collect streamed response
    const chunks: Uint8Array[] = []
    yield* Stream.runForEach(textStream, (chunk) =>
      Effect.sync(() => {
        chunks.push(chunk)
      })
    )

    const responseText = new TextDecoder().decode(
      new Uint8Array(chunks.flatMap((chunk) => Array.from(chunk)))
    )

    // 6. Save assistant message to database
    const savedAssistantMessage = yield* chatRepo.create({
      role: 'assistant',
      content: responseText,
      imageUrl: undefined,
      plantId,
      userId,
    })

    if (!savedAssistantMessage) {
      return yield* Effect.fail(new Error('Failed to save assistant message'))
    }

    // 7. Publish event
    yield* publishWithRetry(
      eventBus.publish({
        _tag: 'ChatMessageSent',
        userId,
        plantId,
        messageId: savedAssistantMessage.id,
      })
    )

    // 8. Return response
    return {
      message: savedUserMessage,
      response: responseText,
    }
  })
