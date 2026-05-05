import { openai } from '@ai-sdk/openai'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { CHAT_MODEL, FAST_MODEL } from '@lily/api/services/ai/models'
import {
  buildGeneralSystemPrompt,
  buildPlantSystemPrompt,
  formatCareHistoryText,
} from '@lily/api/services/ai-chat/build-system-prompt'
import {
  buildGeneralChatTools,
  buildPlantChatTools,
  type ToolContext,
} from '@lily/api/services/ai-chat/tools'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { assertCanAccessPlant } from '@lily/api/services/plants/helpers/assert-can-access-plant'
import { daysSince } from '@lily/shared'
import type { ChatConversation } from '@lily/shared/ai-chat'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
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
  Match,
  Option,
  Predicate,
  pipe,
  Struct,
} from 'effect'

// Type alias to avoid TS4023: bun's module resolution prevents TS
// from naming the 'Output' generic in declaration files
// biome-ignore lint/suspicious/noExplicitAny: required by StreamTextResult generic
export type PlantChatStreamResult = StreamTextResult<ToolSet, any>

export interface StepData {
  readonly text: string
  readonly toolResults: readonly {
    readonly toolName: string
    readonly toolCallId: string
    readonly input: unknown
    readonly output: unknown
  }[]
}

export interface PlantChatResult {
  stream: PlantChatStreamResult
  completionDeferred: Deferred.Deferred<readonly StepData[]>
}

export interface PlantChatImageOptions {
  imageUrl?: string | undefined
  imageKey?: string | undefined
}

const appendImageToLastUserMessage = (
  modelMessages: ReturnType<typeof convertToModelMessages> extends Promise<
    infer T
  >
    ? T
    : never,
  imageUrl: string | undefined
) => {
  if (!imageUrl) return modelMessages
  const lastIndex = modelMessages.length - 1
  return pipe(
    Array.get(modelMessages, lastIndex),
    Option.filter((msg) => msg.role === 'user'),
    Option.map((lastMsg) => {
      const imageContent = {
        type: 'image' as const,
        image: new URL(imageUrl),
      }
      const updatedContent = pipe(
        Match.value(lastMsg.content),
        Match.when(Predicate.isString, (str) => [
          { type: 'text' as const, text: str },
          imageContent,
        ]),
        Match.orElse((arr) =>
          Array.append(arr as { type: string }[], imageContent)
        )
      )
      return pipe(
        Array.take(modelMessages, lastIndex),
        Array.append(Struct.evolve(lastMsg, { content: () => updatedContent }))
      ) as typeof modelMessages
    }),
    Option.getOrElse(() => modelMessages)
  )
}

/**
 * Unified chat stream — dispatches on conversation kind.
 * Plant-anchored conversations gather plant data + care history;
 * general conversations skip that and use the general system prompt.
 */
export const chatStream = (
  conversation: ChatConversation,
  messages: UIMessage[],
  imageOptions?: PlantChatImageOptions
) =>
  Effect.gen(function* () {
    const { id: userId } = yield* CurrentUser
    const runtime = yield* Effect.runtime<ToolContext>()

    const isPlant =
      conversation.kind === 'plant' && Boolean(conversation.plantId)

    const { systemPrompt, tools } = isPlant
      ? yield* buildPlantContext(
          conversation.plantId!,
          imageOptions?.imageKey,
          runtime,
          userId
        )
      : {
          systemPrompt: buildGeneralSystemPrompt(),
          tools: buildGeneralChatTools({
            runtime,
            userId,
            ...(imageOptions?.imageKey
              ? { imageKey: imageOptions.imageKey }
              : {}),
          }),
        }

    const modelMessages = yield* Effect.promise(() =>
      convertToModelMessages(messages)
    )

    const finalModelMessages = appendImageToLastUserMessage(
      modelMessages,
      imageOptions?.imageUrl
    )

    const useVisionModel = Boolean(imageOptions?.imageUrl)

    // Deferred that resolves with step data when streaming finishes
    const completionDeferred = yield* Deferred.make<readonly StepData[]>()

    const stream: PlantChatStreamResult = streamText({
      model: openai(useVisionModel ? CHAT_MODEL : FAST_MODEL),
      maxRetries: 0,
      system: systemPrompt,
      messages: finalModelMessages,
      tools,
      stopWhen: stepCountIs(3),
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

        Deferred.unsafeDone(completionDeferred, Effect.succeed(stepData))
      },
    })

    return { stream, completionDeferred }
  })

const buildPlantContext = (
  plantId: string,
  imageKey: string | undefined,
  runtime: ReturnType<typeof Effect.runtime<ToolContext>> extends Effect.Effect<
    infer R,
    unknown,
    unknown
  >
    ? R
    : never,
  userId: string
) =>
  Effect.gen(function* () {
    const plantRepo = yield* PlantRepository
    const careLogRepo = yield* CareLogRepository
    const scheduleRepo = yield* CareScheduleRepository

    const plant = yield* plantRepo.findById(plantId)
    if (!plant) {
      return yield* new PlantNotFoundError({ plantId })
    }
    yield* assertCanAccessPlant(plant.userId, plant.id)

    const schedules = yield* scheduleRepo.findByPlant(plantId)
    const careLogsResponse = yield* careLogRepo.findByPlantId({
      plantId,
      limit: 10,
    })
    const careHistoryText = formatCareHistoryText(careLogsResponse.items)
    const daysSinceAdded = daysSince(plant.dateAdded)

    const systemPrompt = buildPlantSystemPrompt({
      plant: { ...plant, schedules },
      daysSinceAdded,
      careHistoryText,
    })

    const tools = buildPlantChatTools({
      runtime,
      userId,
      plantId,
      ...(imageKey ? { imageKey } : {}),
      plantName: plant.name,
    })

    return { systemPrompt, tools }
  })

/**
 * @deprecated Prefer `chatStream(conversation, ...)`. Retained for the
 * legacy `/plants/:plantId/chat/stream` compatibility shim.
 */
export const plantChat = (
  plantId: string,
  messages: UIMessage[],
  imageOptions?: PlantChatImageOptions
) =>
  chatStream(
    {
      // Synthetic conversation row used only for dispatch; persistence
      // routes through a real conversation resolved at the handler layer.
      id: 'legacy-plant',
      userId: 'legacy',
      kind: 'plant',
      plantId,
      createdAt: new Date(0),
      lastMessageAt: new Date(0),
    },
    messages,
    imageOptions
  )
