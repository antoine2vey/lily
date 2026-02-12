import { HttpServerResponse } from '@effect/platform'
import type { SqlError } from '@effect/sql/SqlError'
import { EventBus, publishWithRetry } from '@lily/api/events'
import type { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import { ChatRepository } from '@lily/api/repositories/chat.repository'
import { DiagnosisRepository } from '@lily/api/repositories/diagnosis.repository'
import type { PlantRepository } from '@lily/api/repositories/plant.repository'
import { AiService } from '@lily/api/services/ai/service'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { LimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import { UsageTracker } from '@lily/api/services/subscriptions/usage-tracker'
import type { PlantNotFoundError } from '@lily/shared/errors/plant'
import type { UIMessage } from 'ai'
import { Array, Effect, Option, pipe, Stream } from 'effect'

const QUOTA_EXCEEDED_KEY = '__QUOTA_EXCEEDED__'

export interface StreamChatRequest {
  message: string
  imageUrl?: string
}

const encoder = new TextEncoder()

/**
 * Encode an async iterable of UI message chunks as SSE events
 * that the AI SDK client (DefaultChatTransport) can parse.
 */
const uiStreamToSse = (
  stream: AsyncIterable<unknown>
): Stream.Stream<Uint8Array, Error> => {
  const sseChunks = Stream.fromAsyncIterable(stream, (e) => e as Error).pipe(
    Stream.map((chunk) => encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
  )

  const done = Stream.make(encoder.encode('data: [DONE]\n\n'))

  return pipe(sseChunks, Stream.concat(done))
}

export const streamChatMessage = (
  plantId: string,
  request: StreamChatRequest
): Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  PlantNotFoundError | SqlError,
  | ChatRepository
  | AiService
  | EventBus
  | CurrentUser
  | PlantRepository
  | CareLogRepository
  | DiagnosisRepository
  | LimitChecker
  | UsageTracker
> =>
  Effect.gen(function* () {
    const chatRepo = yield* ChatRepository
    const aiService = yield* AiService
    const eventBus = yield* EventBus
    const diagnosisRepo = yield* DiagnosisRepository
    const { id: userId } = yield* CurrentUser
    const limitChecker = yield* LimitChecker
    const usageTracker = yield* UsageTracker

    // Create the new user message (include image part if present)
    const userMessage: UIMessage = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      role: 'user',
      parts: [
        ...(request.imageUrl
          ? [
              {
                type: 'file' as const,
                mediaType: 'image/jpeg',
                url: request.imageUrl,
              },
            ]
          : []),
        { type: 'text', text: request.message },
      ],
    }

    // Check if user has reached their AI chat limit
    const limitExceeded = yield* limitChecker.checkAiChatLimit(userId).pipe(
      Effect.map(() => false),
      Effect.catchTag('LimitExceededError', () => Effect.succeed(true))
    )

    if (limitExceeded) {
      const assistantUIMessage: UIMessage = {
        id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        role: 'assistant',
        parts: [{ type: 'text', text: QUOTA_EXCEEDED_KEY }],
      }

      yield* chatRepo.saveChat({
        plantId,
        userId,
        messages: [userMessage, assistantUIMessage],
      })

      // Stream quota message as SSE
      async function* quotaChunks() {
        yield { type: 'text-start', id: 'quota-msg' }
        yield {
          type: 'text-delta',
          delta: QUOTA_EXCEEDED_KEY,
          id: 'quota-msg',
        }
        yield { type: 'text-end', id: 'quota-msg' }
      }

      return HttpServerResponse.stream(uiStreamToSse(quotaChunks()), {
        contentType: 'text/event-stream; charset=utf-8',
      })
    }

    // Get previous messages from database (secure - server-side history)
    const previousMessages = yield* chatRepo.getMessagesAsUIMessages(
      plantId,
      userId
    )

    // Combine history with new user message
    const allMessages = [...previousMessages, userMessage]

    const { stream: streamResult, createdDiagnoses } =
      yield* aiService.plantChatStream(
        plantId,
        allMessages,
        request.imageUrl ? { imageUrl: request.imageUrl } : undefined
      )

    // Handle post-stream operations in background
    Promise.resolve(streamResult.text)
      .then(async (fullText) => {
        await Effect.runPromise(
          Effect.gen(function* () {
            // Build assistant UIMessage
            const assistantUIMessage: UIMessage = {
              id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
              role: 'assistant',
              parts: [{ type: 'text', text: fullText }],
            }

            // Save messages to database
            const savedMessages = yield* chatRepo.saveChat({
              plantId,
              userId,
              messages: [userMessage, assistantUIMessage],
            })

            // Find the user message's DB row ID for diagnosis linking
            const userMessageDbId = pipe(
              Array.findFirst(
                savedMessages,
                (m) => m.messageId === userMessage.id && m.role === 'user'
              ),
              Option.map((m) => m.id),
              Option.getOrUndefined
            )

            yield* publishWithRetry(
              eventBus.publish({
                _tag: 'ChatMessageSent',
                userId,
                plantId,
                messageId: assistantUIMessage.id,
              })
            )

            // Link diagnoses to the user message that triggered them
            if (userMessageDbId) {
              for (const diagnosis of createdDiagnoses) {
                yield* diagnosisRepo.linkChatMessage(
                  diagnosis.diagnosisId,
                  userMessageDbId
                )

                yield* publishWithRetry(
                  eventBus.publish({
                    _tag: 'DiseaseIdentified',
                    userId,
                    plantId,
                  })
                )
              }
            }

            // Track usage after successful chat
            yield* usageTracker.trackAiChat(userId)
          })
        )
      })
      .catch(() => {})

    // Stream UI message chunks as SSE events
    const uiStream = streamResult.toUIMessageStream()

    return HttpServerResponse.stream(uiStreamToSse(uiStream), {
      contentType: 'text/event-stream; charset=utf-8',
    })
  })
