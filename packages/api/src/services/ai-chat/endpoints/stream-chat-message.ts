import { HttpServerResponse } from '@effect/platform'
import type { SqlError } from '@effect/sql/SqlError'
import type { PgDrizzle } from '@effect/sql-drizzle/Pg'
import { EventBus, publishWithRetry } from '@lily/api/events'
import { ChatRepository } from '@lily/api/repositories/chat.repository'
import { AiService, streamSdk } from '@lily/api/services/ai/service'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { LimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import { UsageTracker } from '@lily/api/services/subscriptions/usage-tracker'
import type { LimitExceededError } from '@lily/shared'
import type { UIMessage } from 'ai'
import { Array, Effect } from 'effect'

export interface StreamChatRequest {
  message: string
}

const DISEASE_KEYWORDS = [
  'disease',
  'infection',
  'fungus',
  'pest',
  'rot',
  'blight',
  'mold',
  'wilting',
  'mildew',
  'bacterial',
] as const

const RARITY_KEYWORDS = [
  'rare',
  'uncommon',
  'exotic',
  'endangered',
  'unusual',
] as const

const containsKeyword = (
  text: string,
  keywords: readonly string[]
): boolean => {
  const lowerText = text.toLowerCase()
  return Array.some(keywords, (keyword) => lowerText.includes(keyword))
}

export const streamChatMessage = (
  plantId: string,
  request: StreamChatRequest
): Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  Error | SqlError | LimitExceededError,
  | ChatRepository
  | AiService
  | EventBus
  | CurrentUser
  | PgDrizzle
  | LimitChecker
  | UsageTracker
> =>
  Effect.gen(function* () {
    const chatRepo = yield* ChatRepository
    const aiService = yield* AiService
    const eventBus = yield* EventBus
    const { id: userId } = yield* CurrentUser
    const limitChecker = yield* LimitChecker
    const usageTracker = yield* UsageTracker

    // Check if user has reached their AI chat limit
    yield* limitChecker.checkAiChatLimit(userId)

    // Create the new user message
    const userMessage: UIMessage = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      role: 'user',
      parts: [{ type: 'text', text: request.message }],
    }

    // Get previous messages from database (secure - server-side history)
    const previousMessages = yield* chatRepo.getMessagesAsUIMessages(
      plantId,
      userId
    )

    // Combine history with new user message
    const allMessages = [...previousMessages, userMessage]

    // Get the raw AI SDK stream result
    const streamResult = yield* aiService.plantChatStream(plantId, allMessages)

    // Handle post-stream operations in background
    // Note: text promise resolves after the stream completes
    streamResult.text.then(async (responseText) => {
      // Save both user and assistant messages
      const assistantUIMessage: UIMessage = {
        id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        role: 'assistant',
        parts: [{ type: 'text', text: responseText }],
      }

      // Save messages to database
      await Effect.runPromise(
        chatRepo.saveChat({
          plantId,
          userId,
          messages: [userMessage, assistantUIMessage],
        })
      )

      // Publish events
      await Effect.runPromise(
        Effect.gen(function* () {
          yield* publishWithRetry(
            eventBus.publish({
              _tag: 'ChatMessageSent',
              userId,
              plantId,
              messageId: assistantUIMessage.id,
            })
          )

          if (containsKeyword(responseText, DISEASE_KEYWORDS)) {
            yield* publishWithRetry(
              eventBus.publish({
                _tag: 'DiseaseIdentified',
                userId,
                plantId,
              })
            )
          }

          if (containsKeyword(responseText, RARITY_KEYWORDS)) {
            yield* publishWithRetry(
              eventBus.publish({
                _tag: 'RarePlantIdentified',
                userId,
                plantId,
              })
            )
          }

          // Track usage after successful chat
          yield* usageTracker.trackAiChat(userId)
        })
      )
    })

    // Return the streaming response using Effect Stream
    return HttpServerResponse.stream(streamSdk(streamResult.textStream), {
      contentType: 'text/plain; charset=utf-8',
    })
  })
