import type { SqlError } from '@effect/sql/SqlError'
import { EventBus, publishWithRetry } from '@lily/api/events'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import { ChatRepository } from '@lily/api/repositories/chat.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { AiService } from '@lily/api/services/ai/service'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { LimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import { UsageTracker } from '@lily/api/services/subscriptions/usage-tracker'
import type { LimitExceededError } from '@lily/shared'
import type { ChatRequest, ChatResponse } from '@lily/shared/ai-chat'
import type { PlantNotFoundError } from '@lily/shared/errors/plant'
import type { UIMessage } from 'ai'
import { Array as Arr, Effect, Option, pipe, Stream } from 'effect'

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
]

const RARITY_KEYWORDS = ['rare', 'uncommon', 'exotic', 'endangered', 'unusual']

function containsKeyword(text: string, keywords: readonly string[]): boolean {
  const lowerText = text.toLowerCase()
  return Arr.some(keywords, (keyword) => lowerText.includes(keyword))
}

export const sendChatMessage = (
  plantId: string,
  request: ChatRequest
): Effect.Effect<
  ChatResponse,
  Error | SqlError | LimitExceededError | PlantNotFoundError,
  | ChatRepository
  | AiService
  | EventBus
  | CurrentUser
  | PlantRepository
  | CareLogRepository
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

    const userMessage = pipe(
      Option.fromNullable(request.message),
      Option.getOrElse(() => '')
    )

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

    const historyResult = yield* chatRepo.findByPlantId({
      plantId,
      userId,
      limit: 100,
    })

    const uiMessages: UIMessage[] = Arr.map(historyResult.items, (msg) => ({
      id: msg.id,
      role: msg.role as 'user' | 'assistant',
      parts: [{ type: 'text' as const, text: msg.content }],
    }))

    const textStream = yield* aiService.plantChat(plantId, uiMessages)

    const chunks: Uint8Array[] = []
    yield* Stream.runForEach(textStream, (chunk) =>
      Effect.sync(() => {
        chunks.push(chunk)
      })
    )

    const responseText = new TextDecoder().decode(
      new Uint8Array(Arr.flatMap(chunks, (chunk) => [...chunk]))
    )

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

    yield* publishWithRetry(
      eventBus.publish({
        _tag: 'ChatMessageSent',
        userId,
        plantId,
        messageId: savedAssistantMessage.id,
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

    return {
      message: savedUserMessage,
      response: responseText,
    }
  })
