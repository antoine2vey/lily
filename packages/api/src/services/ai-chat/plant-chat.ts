import { openai } from '@ai-sdk/openai'
import type { Conversation } from '@lily/api/repositories/chat.repository'
import { chatContextFor } from '@lily/api/services/ai-chat/chat-context'
import {
  buildGeneralChatTools,
  buildPlantChatTools,
  type ToolContext,
} from '@lily/api/services/ai-chat/tools'
import { caller } from '@lily/api/services/plants/helpers/with-plant-access'
import type { StoredObjectRef } from '@lily/shared/services/file/stored-object'
import {
  convertToModelMessages,
  type StreamTextResult,
  stepCountIs,
  streamText,
  type ToolSet,
  type UIMessage,
} from 'ai'
import {
  Array,
  Deferred,
  Effect,
  Exit,
  Match,
  Option,
  pipe,
  Schema,
} from 'effect'

// Type alias to avoid TS4023: bun's module resolution prevents TS
// from naming the 'Output' generic in declaration files
// biome-ignore lint/suspicious/noExplicitAny: required by StreamTextResult generic
export type PlantChatStreamResult = StreamTextResult<ToolSet, any, any>

export interface StepData {
  readonly text: string
  readonly toolResults: readonly {
    readonly toolName: string
    readonly toolCallId: string
    readonly input: unknown
    readonly output: unknown
  }[]
}

/** The model or provider failed before the reply completed. */
export class ChatStreamError extends Schema.TaggedError<
  ChatStreamError,
  { readonly brand: unique symbol }
>()('ChatStreamError', {
  message: Schema.String,
  cause: Schema.Defect(),
}) {}

export const CHAT_MAX_OUTPUT_TOKENS = 2048

export interface PlantChatResult {
  stream: PlantChatStreamResult
  completionDeferred: Deferred.Deferred<readonly StepData[], ChatStreamError>
}

export interface PlantChatImageOptions {
  imageUrl?: string | undefined
  imageKey?: StoredObjectRef | undefined
}

export const chatStream = (
  conversation: Conversation,
  messages: UIMessage[],
  imageOptions?: PlantChatImageOptions
) =>
  Effect.gen(function* () {
    const who = yield* caller
    const { userId } = who
    const runtime = yield* Effect.context<ToolContext>()

    const image = pipe(
      Option.fromNullishOr(imageOptions?.imageKey),
      Option.map((key) => ({ key, conversationId: conversation.id })),
      Option.getOrUndefined
    )

    const context = yield* chatContextFor(who, conversation, {
      withImage: Boolean(imageOptions?.imageUrl),
    })

    const tools = pipe(
      Match.value(context),
      Match.discriminatorsExhaustive('kind')({
        plant: ({ permit, plant, timezone }) =>
          buildPlantChatTools({
            runtime,
            userId,
            permit,
            image,
            plantName: plant.name,
            timezone,
          }),
        general: () => buildGeneralChatTools({ runtime, userId, image }),
      })
    )

    const modelMessages = yield* Effect.promise(() =>
      convertToModelMessages(messages)
    )

    const completionDeferred = yield* Deferred.make<
      readonly StepData[],
      ChatStreamError
    >()

    const stream: PlantChatStreamResult = streamText({
      model: openai(context.model),
      maxRetries: 0,
      system: context.systemPrompt,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(3),
      maxOutputTokens: CHAT_MAX_OUTPUT_TOKENS,
      onError: ({ error }) => {
        Deferred.doneUnsafe(
          completionDeferred,
          Exit.fail(
            new ChatStreamError({ message: String(error), cause: error })
          )
        )
      },
      onFinish: ({ steps }) => {
        const stepData: readonly StepData[] = Array.map(steps, (step) => ({
          text: step.text,
          toolResults: Array.map(step.toolResults, (tr) => ({
            toolName: tr.toolName,
            toolCallId: tr.toolCallId,
            input: tr.input,
            output: tr.output,
          })),
        }))

        Deferred.doneUnsafe(completionDeferred, Exit.succeed(stepData))
      },
    })

    return { stream, completionDeferred }
  })
