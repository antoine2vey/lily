import { HttpServerResponse } from '@effect/platform'
import type { SqlError } from '@effect/sql/SqlError'
import { StreamTransformError } from '@lily/api/errors/defects'
import type { EventBus } from '@lily/api/events'
import type { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import type { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import { ChatRepository } from '@lily/api/repositories/chat.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import type { DiagnosisRepository } from '@lily/api/repositories/diagnosis.repository'
import type { PlantRepository } from '@lily/api/repositories/plant.repository'
import { AiService } from '@lily/api/services/ai/service'
import { generateMessageId } from '@lily/api/services/ai-chat/generate-message-id'
import { persistChatCompletion } from '@lily/api/services/ai-chat/persist-chat-completion'
import type { StepData } from '@lily/api/services/ai-chat/plant-chat'
import { resolveMessageImageUrls } from '@lily/api/services/ai-chat/resolve-image-urls'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { RagService } from '@lily/api/services/rag/service'
import { LimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import type { UsageTracker } from '@lily/api/services/subscriptions/usage-tracker'
import type { ChatConversation } from '@lily/shared/ai-chat'
import type {
  PlantNotAuthorizedError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import { GCSService } from '@lily/shared/services/file/gcs'
import type { GCSUploadError } from '@lily/shared/services/file/gcs-errors'
import type { UIMessage } from 'ai'
import { Array, Deferred, Effect, Option, pipe, Schedule, Stream } from 'effect'

// Exponential backoff: 200ms -> 400ms -> 800ms (max 3 retries)
const postStreamRetryPolicy = Schedule.exponential('200 millis').pipe(
  Schedule.compose(Schedule.recurs(3))
)

const QUOTA_EXCEEDED_KEY = '__QUOTA_EXCEEDED__'

const makeImageParts = (url: string | undefined): UIMessage['parts'] =>
  pipe(
    Option.fromNullable(url),
    Option.match({
      onNone: (): UIMessage['parts'] => [],
      onSome: (u): UIMessage['parts'] => [
        { type: 'file' as const, mediaType: 'image/jpeg', url: u },
      ],
    })
  )

export interface StreamChatRequest {
  message: string
  imageUrl?: string
  imageKey?: string
}

const encoder = new TextEncoder()

const SSE_HEADERS = {
  'cache-control': 'no-cache',
  'x-accel-buffering': 'no',
  connection: 'keep-alive',
}

const uiStreamToSse = (
  stream: AsyncIterable<unknown>,
  onComplete?: Effect.Effect<void>
): Stream.Stream<Uint8Array, StreamTransformError> => {
  const sseChunks = Stream.fromAsyncIterable(
    stream,
    (e) =>
      new StreamTransformError({
        message: String(e),
        cause: e,
      })
  ).pipe(
    Stream.map((chunk) => encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
  )

  const afterStream = Stream.fromEffect(
    pipe(
      Option.getOrElse(Option.fromNullable(onComplete), () => Effect.void),
      Effect.as(encoder.encode('data: [DONE]\n\n'))
    )
  )

  return pipe(sseChunks, Stream.concat(afterStream))
}

const makeSseResponse = (
  sseStream: Stream.Stream<Uint8Array, StreamTransformError>
) =>
  pipe(
    HttpServerResponse.stream(sseStream, {
      contentType: 'text/event-stream; charset=utf-8',
    }),
    HttpServerResponse.setHeaders(SSE_HEADERS)
  )

export const streamChatMessage = (
  conversation: ChatConversation,
  request: StreamChatRequest
): Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  PlantNotFoundError | PlantNotAuthorizedError | SqlError | GCSUploadError,
  | ChatRepository
  | AiService
  | EventBus
  | CurrentUser
  | PlantRepository
  | CareLogRepository
  | CareScheduleRepository
  | DiagnosisRepository
  | DelegationRepository
  | LimitChecker
  | UsageTracker
  | GCSService
  | RagService
> =>
  Effect.gen(function* () {
    const chatRepo = yield* ChatRepository
    const aiService = yield* AiService
    const { id: userId } = yield* CurrentUser
    const limitChecker = yield* LimitChecker
    const gcs = yield* GCSService

    // If imageKey is provided, generate a fresh signed URL for AI processing
    const imageSignedUrl: string | undefined = yield* pipe(
      Option.fromNullable(request.imageKey),
      Option.match({
        onNone: () => Effect.succeed(request.imageUrl),
        onSome: (key: string) => gcs.getSignedUrl(key),
      })
    )

    const fileParts = makeImageParts(request.imageKey)

    const userMessage: UIMessage = {
      id: generateMessageId('user'),
      role: 'user',
      parts: Array.append(fileParts, {
        type: 'text' as const,
        text: request.message,
      }) as UIMessage['parts'],
    }

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
        conversationId: conversation.id,
        userId,
        messages: [userMessage, assistantUIMessage],
      })
      yield* chatRepo.touchLastMessageAt(conversation.id)

      async function* quotaChunks() {
        yield { type: 'text-start', id: 'quota-msg' }
        yield {
          type: 'text-delta',
          delta: QUOTA_EXCEEDED_KEY,
          id: 'quota-msg',
        }
        yield { type: 'text-end', id: 'quota-msg' }
      }

      return makeSseResponse(uiStreamToSse(quotaChunks()))
    }

    const previousMessages = yield* chatRepo.getMessagesAsUIMessages(
      conversation.id
    )

    const resolvedPreviousMessages =
      yield* resolveMessageImageUrls(previousMessages)

    const aiFileParts = makeImageParts(imageSignedUrl)
    const userMessageForAi: UIMessage = {
      id: userMessage.id,
      role: userMessage.role,
      parts: Array.append(aiFileParts, {
        type: 'text' as const,
        text: request.message,
      }) as UIMessage['parts'],
    }
    const allMessages = Array.append(
      resolvedPreviousMessages,
      userMessageForAi
    ) as UIMessage[]

    const imageOptions = pipe(
      Option.fromNullable(imageSignedUrl),
      Option.map((url) => ({
        imageUrl: url,
        imageKey: request.imageKey,
      })),
      Option.getOrUndefined
    )

    const { stream: streamResult, completionDeferred } =
      yield* aiService.chatStream(conversation, allMessages, imageOptions)

    const uiStream = streamResult.toUIMessageStream()
    const context = yield* Effect.context<
      ChatRepository | DiagnosisRepository | EventBus | UsageTracker | AiService
    >()

    const onComplete = Deferred.await(completionDeferred).pipe(
      Effect.timeout('30 seconds'),
      Effect.catchTag('TimeoutException', () =>
        Effect.logError('AI stream completion timed out', {
          conversationId: conversation.id,
          userId,
        }).pipe(Effect.as([] as readonly StepData[]))
      ),
      Effect.flatMap((steps) =>
        persistChatCompletion({ conversation, userId, userMessage, steps })
      ),
      Effect.retry(postStreamRetryPolicy),
      Effect.catchTag('SqlError', (error) =>
        Effect.logError('Failed to save chat message after stream', {
          error: String(error),
          conversationId: conversation.id,
          userId,
        })
      ),
      Effect.provide(context)
    )

    return makeSseResponse(uiStreamToSse(uiStream, onComplete))
  })
