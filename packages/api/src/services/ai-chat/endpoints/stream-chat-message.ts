import { StreamTransformError } from '@lily/api/errors/defects'
import type { EventBus } from '@lily/api/events'
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
import type {
  ChatStreamError,
  StepData,
} from '@lily/api/services/ai-chat/plant-chat'
import { resolveMessageImageUrls } from '@lily/api/services/ai-chat/resolve-image-urls'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { RagService } from '@lily/api/services/rag/service'
import {
  type Billing,
  UsageTracker,
} from '@lily/api/services/subscriptions/usage-tracker'
import {
  type ChatConversation,
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
  Cause,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Match,
  Option,
  pipe,
  Record,
  Schedule,
  Stream,
} from 'effect'
import { HttpServerResponse } from 'effect/http'
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
}

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

/** How a chat turn ended once it got past the quota check. */
type TurnOutcome =
  | 'replied'
  | 'replyNotSaved'
  | 'emptyReply'
  | 'modelFailed'
  | 'timedOut'
  | 'crashed'

// The user saw the reply in both kept cases; only saving it failed for
// `replyNotSaved`.
const turnBilling: Record<TurnOutcome, Billing> = {
  replied: 'charge',
  replyNotSaved: 'charge',
  emptyReply: 'refund',
  modelFailed: 'refund',
  timedOut: 'refund',
  crashed: 'refund',
}

const turnFailureLog: Record<Exclude<TurnOutcome, 'replied'>, string> = {
  replyNotSaved: 'Failed to save chat message after stream',
  emptyReply: 'AI stream produced an empty reply',
  modelFailed: 'AI stream failed',
  timedOut: 'AI stream timed out',
  crashed: 'AI chat turn crashed',
}

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

      return yield* aiService.chatStream(
        conversation,
        allMessages,
        imageOptions
      )
    })

    const failedWith = (
      outcome: Exclude<TurnOutcome, 'replied'>,
      detail: unknown
    ) =>
      Effect.logError(turnFailureLog[outcome], {
        error: String(detail),
        conversationId: conversation.id,
        userId,
      }).pipe(Effect.as<TurnOutcome>(outcome))

    const saveReply = (steps: readonly StepData[]) =>
      persistChatCompletion({ conversation, userId, userMessage, steps }).pipe(
        Effect.retry(postStreamRetryPolicy),
        Effect.as<TurnOutcome>('replied'),
        Effect.catchTag('SqlError', (error) =>
          failedWith('replyNotSaved', error)
        )
      )

    const outcomeOf = (
      exit: Exit.Exit<readonly StepData[], ChatStreamError | Cause.TimeoutError>
    ) =>
      Exit.match(exit, {
        onSuccess: (steps) =>
          isEmptyReply(steps)
            ? failedWith('emptyReply', steps)
            : saveReply(steps),
        onFailure: (cause) =>
          pipe(
            Cause.findErrorOption(cause),
            Option.match({
              onNone: () => failedWith('crashed', Cause.pretty(cause)),
              onSome: (error) =>
                pipe(
                  Match.value(error),
                  Match.tag('ChatStreamError', () =>
                    failedWith('modelFailed', error)
                  ),
                  Match.tag('TimeoutError', () =>
                    failedWith('timedOut', error)
                  ),
                  Match.exhaustive
                ),
            })
          ),
      })

    const metered = yield* usageTracker
      .withDetachedReservation(userId, 'aiChats', {
        start: startStream,
        // Drains the model stream server-side (the response body is a tee of
        // the same stream), so the reply is saved even if the client goes away.
        work: ({ stream, completionDeferred }) =>
          Effect.promise(() => stream.consumeStream()).pipe(
            Effect.andThen(Deferred.await(completionDeferred)),
            Effect.timeout(streamCompletionTimeout)
          ),
        bill: (exit) =>
          Effect.map(outcomeOf(exit), (outcome) => turnBilling[outcome]),
        detach: chatTurns.fork,
      })
      .pipe(
        Effect.asSome,
        Effect.catchTag('LimitExceededError', () => Effect.succeedNone)
      )

    return Option.match(metered, {
      onNone: () => {
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
      },
      onSome: ({ started, settled }) =>
        makeSseResponse(
          uiStreamToSse(
            started.stream.toUIMessageStream(),
            Effect.asVoid(Fiber.await(settled))
          )
        ),
    })
  })
