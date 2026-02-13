import { HttpServerResponse } from '@effect/platform'
import type { SqlError } from '@effect/sql/SqlError'
import { EventBus, publishWithRetry } from '@lily/api/events'
import type { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import { ChatRepository } from '@lily/api/repositories/chat.repository'
import { DiagnosisRepository } from '@lily/api/repositories/diagnosis.repository'
import type { PlantRepository } from '@lily/api/repositories/plant.repository'
import { AiService } from '@lily/api/services/ai/service'
import { resolveMessageImageUrls } from '@lily/api/services/ai-chat/resolve-image-urls'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { LimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import { UsageTracker } from '@lily/api/services/subscriptions/usage-tracker'
import { nowAsEpochMillis } from '@lily/shared'
import type { PlantNotFoundError } from '@lily/shared/errors/plant'
import { GCSService, type GCSUploadError } from '@lily/shared/services/file/gcs'
import type { UIMessage } from 'ai'
import { Array, Effect, Option, pipe, Schedule, Stream } from 'effect'

// Exponential backoff: 200ms -> 400ms -> 800ms (max 3 retries)
const postStreamRetryPolicy = Schedule.exponential('200 millis').pipe(
  Schedule.compose(Schedule.recurs(3))
)

const QUOTA_EXCEEDED_KEY = '__QUOTA_EXCEEDED__'

const generateMessageId = (role: 'user' | 'assistant'): string =>
  `${role}-${nowAsEpochMillis()}-${Math.random().toString(36).slice(2, 11)}`

export interface StreamChatRequest {
  message: string
  imageUrl?: string
  imageKey?: string
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
  PlantNotFoundError | SqlError | GCSUploadError,
  | ChatRepository
  | AiService
  | EventBus
  | CurrentUser
  | PlantRepository
  | CareLogRepository
  | DiagnosisRepository
  | LimitChecker
  | UsageTracker
  | GCSService
> =>
  Effect.gen(function* () {
    const chatRepo = yield* ChatRepository
    const aiService = yield* AiService
    const eventBus = yield* EventBus
    const diagnosisRepo = yield* DiagnosisRepository
    const { id: userId } = yield* CurrentUser
    const limitChecker = yield* LimitChecker
    const usageTracker = yield* UsageTracker
    const gcs = yield* GCSService

    // If imageKey is provided, generate a fresh signed URL for AI processing
    const imageSignedUrl: string | undefined = yield* pipe(
      Option.fromNullable(request.imageKey),
      Option.match({
        onNone: () => Effect.succeed(request.imageUrl),
        onSome: (key: string) => gcs.getSignedUrl(key),
      })
    )

    // Build the file part for DB persistence.
    // Store raw GCS key (not the expiring signed URL) so we can
    // regenerate signed URLs later when loading history.
    const fileParts: UIMessage['parts'] = pipe(
      Option.fromNullable(request.imageKey),
      Option.match({
        onNone: (): UIMessage['parts'] => [],
        onSome: (key): UIMessage['parts'] => [
          { type: 'file' as const, mediaType: 'image/jpeg', url: key },
        ],
      })
    )

    // Create the new user message
    const userMessage: UIMessage = {
      id: generateMessageId('user'),
      role: 'user',
      parts: [...fileParts, { type: 'text', text: request.message }],
    }

    // Check if user has reached their AI chat limit
    const limitExceeded = yield* limitChecker.checkAiChatLimit(userId).pipe(
      Effect.map(() => false),
      Effect.catchTag('LimitExceededError', () => Effect.succeed(true))
    )

    if (limitExceeded) {
      const assistantUIMessage: UIMessage = {
        id: generateMessageId('assistant'),
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

    // Resolve raw GCS key references in historical messages to signed URLs
    // so the AI can access images from previous conversations
    const resolvedPreviousMessages =
      yield* resolveMessageImageUrls(previousMessages)

    // Combine history with new user message (use signed URL for AI, not raw key)
    const aiFileParts: UIMessage['parts'] = pipe(
      Option.fromNullable(imageSignedUrl),
      Option.match({
        onNone: (): UIMessage['parts'] => [],
        onSome: (url): UIMessage['parts'] => [
          { type: 'file' as const, mediaType: 'image/jpeg', url },
        ],
      })
    )
    const userMessageForAi: UIMessage = {
      ...userMessage,
      parts: [...aiFileParts, { type: 'text' as const, text: request.message }],
    }
    const allMessages = [...resolvedPreviousMessages, userMessageForAi]

    const imageContext = pipe(
      Option.fromNullable(imageSignedUrl),
      Option.map((url) => ({ imageUrl: url, imageKey: request.imageKey })),
      Option.getOrUndefined
    )

    const { stream: streamResult, createdDiagnoses } =
      yield* aiService.plantChatStream(plantId, allMessages, imageContext)

    // Handle post-stream operations in background with retries
    Promise.resolve(streamResult.steps)
      .then((steps) =>
        Effect.runPromise(
          Effect.gen(function* () {
            // Collect text from all steps
            const fullText = pipe(
              steps,
              Array.map((step) => step.text),
              Array.join('')
            )

            // Collect tool result parts from all steps so they persist
            // in the DB and show up in chat history (e.g. DiagnosisCard)
            const toolParts: UIMessage['parts'] = pipe(
              steps,
              Array.flatMap((step) =>
                Array.map(step.toolResults, (tr) => ({
                  type: `tool-${tr.toolName}` as const,
                  toolCallId: tr.toolCallId,
                  state: 'output-available' as const,
                  input: tr.input,
                  output: tr.output,
                }))
              )
            ) as UIMessage['parts']

            const assistantUIMessage: UIMessage = {
              id: generateMessageId('assistant'),
              role: 'assistant',
              parts: [{ type: 'text', text: fullText }, ...toolParts],
            }

            const savedMessages = yield* chatRepo.saveChat({
              plantId,
              userId,
              messages: [userMessage, assistantUIMessage],
            })

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

            if (userMessageDbId) {
              yield* Effect.forEach(createdDiagnoses, (diagnosis) =>
                Effect.gen(function* () {
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
                })
              )
            }

            yield* usageTracker.trackAiChat(userId)
          }).pipe(
            Effect.retry(postStreamRetryPolicy),
            Effect.catchAll((error) =>
              Effect.logError('Failed to save chat message after stream', {
                error: String(error),
                plantId,
                userId,
              })
            )
          )
        )
      )
      .catch(() => {})

    // Stream UI message chunks as SSE events
    const uiStream = streamResult.toUIMessageStream()

    return HttpServerResponse.stream(uiStreamToSse(uiStream), {
      contentType: 'text/event-stream; charset=utf-8',
    })
  })
