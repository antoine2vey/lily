import type { CarePlans } from '@lily/api/contexts/care'
import { StreamTransformError } from '@lily/api/errors/defects'
import type { EventBus } from '@lily/api/events'
import type { Outbox } from '@lily/api/kernel/outbox'
import type { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import type { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import type { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import type { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import { ChatRepository } from '@lily/api/repositories/chat.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import type { DiagnosisRepository } from '@lily/api/repositories/diagnosis.repository'
import type { PlantRepository } from '@lily/api/repositories/plant.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import { AiService } from '@lily/api/services/ai/service'
import { ChatTurns } from '@lily/api/services/ai-chat/chat-turns'
import { generateMessageId } from '@lily/api/services/ai-chat/generate-message-id'
import { persistChatCompletion } from '@lily/api/services/ai-chat/persist-chat-completion'
import type { StepData } from '@lily/api/services/ai-chat/plant-chat'
import { resolveMessageImageUrls } from '@lily/api/services/ai-chat/resolve-image-urls'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { RagService } from '@lily/api/services/rag/service'
import {
  type UsageReservation,
  UsageTracker,
} from '@lily/api/services/subscriptions/usage-tracker'
import {
  type ChatConversation,
  type ChatSuggestionTap,
  ConversationNotFoundError,
} from '@lily/shared/ai-chat'
import type {
  PlantNotAuthorizedError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import { GCSService } from '@lily/shared/services/file/gcs'
import type { GCSUploadError } from '@lily/shared/services/file/gcs-errors'
import type { UIMessage } from 'ai'
import {
  Array,
  Deferred,
  Effect,
  Fiber,
  Option,
  pipe,
  Record,
  Schedule,
  Stream,
} from 'effect'
import { HttpServerResponse } from 'effect/http'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

// Exponential backoff: 200ms -> 400ms -> 800ms (max 3 retries)
export const postStreamRetryPolicy = Schedule.max([
  Schedule.exponential('200 millis'),
  Schedule.recurs(3),
])

export const streamCompletionTimeout = '3 minutes'

const QUOTA_EXCEEDED_KEY = '__QUOTA_EXCEEDED__'

// Recent turns are what the model needs to follow up. A fixed window keeps
// each turn's load and prompt size flat however long the conversation grows.
const HISTORY_WINDOW = 30

const makeImageParts = (url: string | undefined): UIMessage['parts'] =>
  pipe(
    Option.fromNullishOr(url),
    Option.match({
      onNone: (): UIMessage['parts'] => [],
      onSome: (u): UIMessage['parts'] => [
        { type: 'file' as const, mediaType: 'image/jpeg', url: u },
      ],
    })
  )

export interface StreamChatRequest {
  message: string
  imageKey?: string
  suggestion?: ChatSuggestionTap
}

const annotateSuggestion = (suggestion: ChatSuggestionTap | undefined) =>
  Option.match(Option.fromUndefinedOr(suggestion), {
    onNone: () => Effect.void,
    onSome: ({ id, source }) =>
      Effect.annotateCurrentSpan({
        'chat.suggestion.id': id,
        'chat.suggestion.source': source,
      }),
  })

const encoder = new TextEncoder()

const SSE_HEADERS = {
  'cache-control': 'no-cache',
  'x-accel-buffering': 'no',
  connection: 'keep-alive',
}

// ai@6.0.82 clients parse chunks with z.strictObject and reject providerMetadata (#89)
const toSseEvent = (chunk: Record.ReadonlyRecord<string, unknown>) =>
  encoder.encode(
    `data: ${JSON.stringify(Record.remove(chunk, 'providerMetadata'))}\n\n`
  )

const uiStreamToSse = (
  stream: AsyncIterable<Record.ReadonlyRecord<string, unknown>>,
  onComplete?: Effect.Effect<void>
): Stream.Stream<Uint8Array, StreamTransformError> => {
  const sseChunks = Stream.fromAsyncIterable(
    stream,
    (e) =>
      new StreamTransformError({
        message: String(e),
        cause: e,
      })
  ).pipe(Stream.map(toSseEvent))

  const afterStream = Stream.fromEffect(
    pipe(
      Option.getOrElse(Option.fromNullishOr(onComplete), () => Effect.void),
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

// Upload keys are `chat/<conversationId>/...`, older ones with an epoch prefix
const isKeyOfConversation = (key: string, conversationId: string) =>
  key.replace(/^\d+-/, '').startsWith(`chat/${conversationId}/`)

const isEmptyReply = (steps: readonly StepData[]) =>
  Array.every(
    steps,
    (step) =>
      step.text.trim().length === 0 &&
      Array.isReadonlyArrayEmpty(step.toolResults)
  )

export const streamChatMessage = (
  conversation: ChatConversation,
  request: StreamChatRequest
): Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  | PlantNotFoundError
  | PlantNotAuthorizedError
  | ConversationNotFoundError
  | SqlError
  | GCSUploadError,
  | ChatRepository
  | AiService
  | ChatTurns
  | EventBus
  | CurrentUser
  | PlantRepository
  | CareLogRepository
  | CareScheduleRepository
  | DiagnosisRepository
  | CarePlanRepository
  | CarePlans
  | SqlClient.SqlClient
  | Outbox
  | UserRepository
  | DelegationRepository
  | CanopyRepository
  | UsageTracker
  | GCSService
  | RagService
> =>
  Effect.gen(function* () {
    const chatRepo = yield* ChatRepository
    const aiService = yield* AiService
    const chatTurns = yield* ChatTurns
    const { id: userId } = yield* CurrentUser
    const usageTracker = yield* UsageTracker
    const gcs = yield* GCSService
    yield* annotateSuggestion(request.suggestion)

    if (
      request.imageKey !== undefined &&
      !isKeyOfConversation(request.imageKey, conversation.id)
    ) {
      return yield* new ConversationNotFoundError({ id: conversation.id })
    }

    const imageSignedUrl: string | undefined = yield* pipe(
      Option.fromNullishOr(request.imageKey),
      Option.match({
        onNone: () => Effect.undefined,
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

    const reservation: Option.Option<UsageReservation> = yield* usageTracker
      .reserve(userId, 'aiChats')
      .pipe(
        Effect.map(Option.some),
        Effect.catchTag('LimitExceededError', () =>
          Effect.succeed(Option.none())
        )
      )

    if (Option.isNone(reservation)) {
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

    const refund = reservation.value.release.pipe(
      Effect.catchTag('SqlError', (error) =>
        Effect.logError('Failed to refund chat usage', {
          error: String(error),
          conversationId: conversation.id,
          userId,
        })
      )
    )

    const startStream = Effect.gen(function* () {
      const previousMessages = yield* chatRepo.getMessagesAsUIMessages(
        conversation.id,
        HISTORY_WINDOW
      )

      yield* chatRepo.saveChat({
        conversationId: conversation.id,
        userId,
        messages: [userMessage],
      })
      yield* chatRepo.touchLastMessageAt(conversation.id)

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
        Option.fromNullishOr(imageSignedUrl),
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
        ChatRepository | DiagnosisRepository | CarePlans | EventBus | AiService
      >()

      const logAndRefund = (reason: string, error: unknown) =>
        Effect.logError(reason, {
          error: String(error),
          conversationId: conversation.id,
          userId,
        }).pipe(Effect.andThen(refund))

      // Drains the model stream server-side (the response body is a tee of
      // the same stream), so the reply is saved even if the client goes away.
      const settle = Effect.gen(function* () {
        const steps = yield* Effect.promise(() =>
          streamResult.consumeStream()
        ).pipe(
          Effect.andThen(Deferred.await(completionDeferred)),
          Effect.timeout(streamCompletionTimeout),
          Effect.onInterrupt(() =>
            logAndRefund('AI stream interrupted by shutdown', 'interrupted')
          )
        )

        if (isEmptyReply(steps)) {
          return yield* logAndRefund('AI stream produced an empty reply', steps)
        }

        yield* persistChatCompletion({
          conversation,
          userId,
          userMessage,
          steps,
        }).pipe(
          Effect.retry(postStreamRetryPolicy),
          Effect.catchTag('SqlError', (error) =>
            Effect.logError('Failed to save chat message after stream', {
              error: String(error),
              conversationId: conversation.id,
              userId,
            })
          ),
          Effect.uninterruptible
        )
      }).pipe(
        Effect.catchTags({
          ChatStreamError: (error) => logAndRefund('AI stream failed', error),
          TimeoutError: (error) => logAndRefund('AI stream timed out', error),
        }),
        Effect.provide(context)
      )

      const settled = yield* chatTurns.fork(settle)

      return makeSseResponse(
        uiStreamToSse(uiStream, Effect.asVoid(Fiber.await(settled)))
      )
    })

    return yield* Effect.onError(startStream, () => refund)
  }).pipe(Effect.withSpan('AIChatService.streamChatMessage'))
