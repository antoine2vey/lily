import type { SqlError } from '@effect/sql/SqlError'
import { EventBus, publishWithRetry } from '@lily/api/events'
import { ChatRepository } from '@lily/api/repositories/chat.repository'
import { DiagnosisRepository } from '@lily/api/repositories/diagnosis.repository'
import { AiService } from '@lily/api/services/ai/service'
import { UsageTracker } from '@lily/api/services/subscriptions/usage-tracker'
import type { ChatConversation } from '@lily/shared/ai-chat'
import type { UIMessage } from 'ai'
import { Array, Effect, Option, pipe } from 'effect'

import { generateMessageId } from './generate-message-id'
import type { StepData } from './plant-chat'

export interface PersistChatCompletionParams {
  readonly conversation: ChatConversation
  readonly userId: string
  readonly userMessage: UIMessage
  readonly steps: readonly StepData[]
}

const extractUserText = (message: UIMessage): string =>
  pipe(
    message.parts,
    Array.filterMap((part) =>
      part.type === 'text'
        ? Option.some((part as { text: string }).text)
        : Option.none()
    ),
    Array.join(' ')
  )

const maybeGenerateTitle = (
  conversation: ChatConversation,
  userMessage: UIMessage,
  assistantReply: string
) =>
  Effect.gen(function* () {
    if (
      conversation.kind !== 'general' ||
      conversation.title ||
      assistantReply.trim().length === 0
    ) {
      return
    }

    const userText = extractUserText(userMessage)
    if (userText.trim().length === 0) {
      return
    }

    const aiService = yield* AiService
    const chatRepo = yield* ChatRepository

    const title = yield* aiService
      .generateConversationTitle({
        userMessage: userText,
        assistantReply,
      })
      .pipe(
        Effect.catchTag('OpenAIError', (error) =>
          Effect.logWarning('Failed to generate conversation title', {
            conversationId: conversation.id,
            error: String(error),
          }).pipe(Effect.as(''))
        )
      )

    if (title.length === 0) return

    yield* chatRepo
      .updateConversationTitle({ id: conversation.id, title })
      .pipe(
        Effect.catchTag('SqlError', (error) =>
          Effect.logWarning('Failed to persist generated conversation title', {
            conversationId: conversation.id,
            error: String(error),
          })
        )
      )
  })

export const persistChatCompletion = (
  params: PersistChatCompletionParams
): Effect.Effect<
  void,
  SqlError,
  ChatRepository | DiagnosisRepository | EventBus | UsageTracker | AiService
> =>
  Effect.gen(function* () {
    const chatRepo = yield* ChatRepository
    const diagnosisRepo = yield* DiagnosisRepository
    const eventBus = yield* EventBus
    const usageTracker = yield* UsageTracker
    const { conversation, userId, userMessage, steps } = params

    const fullText = pipe(
      steps,
      Array.map((step) => step.text),
      Array.join('')
    )

    const toolParts: UIMessage['parts'] = pipe(
      steps,
      Array.flatMap((step) =>
        Array.map(step.toolResults, (tr) => ({
          type: `tool-${tr.toolName}` as const,
          toolCallId: tr.toolCallId,
          state: 'output-available' as const,
          providerExecuted: true,
          input: tr.input,
          output: tr.output,
        }))
      )
    ) as UIMessage['parts']

    const assistantUIMessage: UIMessage = {
      id: generateMessageId('assistant'),
      role: 'assistant',
      parts: Array.prepend(toolParts, {
        type: 'text' as const,
        text: fullText,
      }) as UIMessage['parts'],
    }

    const savedMessages = yield* chatRepo.saveChat({
      conversationId: conversation.id,
      userId,
      messages: [userMessage, assistantUIMessage],
    })

    yield* chatRepo.touchLastMessageAt(conversation.id)

    // Title generation is best-effort and runs detached — don't block the
    // response on it. The frontend invalidates the conversations list when
    // the stream completes, so the title shows up on next refetch.
    yield* Effect.forkDaemon(
      maybeGenerateTitle(conversation, userMessage, fullText)
    )

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
        conversationId: conversation.id,
        ...(conversation.plantId ? { plantId: conversation.plantId } : {}),
        messageId: assistantUIMessage.id,
      })
    )

    if (conversation.plantId && userMessageDbId) {
      const plantId = conversation.plantId
      const createdDiagnoses = pipe(
        steps,
        Array.flatMap((step) =>
          pipe(
            step.toolResults,
            Array.filter((tr) => tr.toolName === 'createDiagnosis'),
            Array.filterMap((tr) =>
              pipe(
                Option.fromNullable(
                  tr.output as { diagnosisId: string } | null
                ),
                Option.map((output) => ({
                  diagnosisId: output.diagnosisId,
                }))
              )
            )
          )
        )
      )
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
  }).pipe(Effect.withSpan('persistChatCompletion'))
