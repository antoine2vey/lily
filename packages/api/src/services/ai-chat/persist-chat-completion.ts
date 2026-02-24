import type { SqlError } from '@effect/sql/SqlError'
import { type IEventBus, publishWithRetry } from '@lily/api/events'
import type { IChatRepository } from '@lily/api/repositories/chat.repository'
import type { IDiagnosisRepository } from '@lily/api/repositories/diagnosis.repository'
import type { IUsageTracker } from '@lily/api/services/subscriptions/usage-tracker'
import type { UIMessage } from 'ai'
import { Array, Effect, Option, pipe } from 'effect'

import { generateMessageId } from './generate-message-id'
import type { StepData } from './plant-chat'

export interface PersistChatCompletionDeps {
  readonly chatRepo: IChatRepository
  readonly diagnosisRepo: IDiagnosisRepository
  readonly eventBus: IEventBus
  readonly usageTracker: IUsageTracker
}

export interface PersistChatCompletionParams {
  readonly plantId: string
  readonly userId: string
  readonly userMessage: UIMessage
  readonly steps: readonly StepData[]
}

export const persistChatCompletion = (
  deps: PersistChatCompletionDeps,
  params: PersistChatCompletionParams
): Effect.Effect<void, SqlError> =>
  Effect.gen(function* () {
    const { chatRepo, diagnosisRepo, eventBus, usageTracker } = deps
    const { plantId, userId, userMessage, steps } = params

    // Collect text from all steps
    const fullText = pipe(
      steps,
      Array.map((step) => step.text),
      Array.join('')
    )

    // Collect tool result parts for frontend rendering (e.g. DiagnosisCard).
    // These are UI-only parts filtered out before sending to the model.
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

    // Derive created diagnoses from step tool results
    const createdDiagnoses = pipe(
      steps,
      Array.flatMap((step) =>
        pipe(
          step.toolResults,
          Array.filter((tr) => tr.toolName === 'createDiagnosis'),
          Array.filterMap((tr) =>
            pipe(
              Option.fromNullable(tr.output as { diagnosisId: string } | null),
              Option.map((output) => ({
                diagnosisId: output.diagnosisId,
              }))
            )
          )
        )
      )
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
  }).pipe(Effect.withSpan('persistChatCompletion'))
