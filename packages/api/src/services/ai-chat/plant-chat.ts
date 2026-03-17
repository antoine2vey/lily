import { openai } from '@ai-sdk/openai'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { CHAT_MODEL, FAST_MODEL } from '@lily/api/services/ai/models'
import {
  buildSystemPrompt,
  formatCareHistoryText,
} from '@lily/api/services/ai-chat/build-system-prompt'
import {
  buildPlantChatTools,
  type ToolContext,
} from '@lily/api/services/ai-chat/tools'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { assertCanAccessPlant } from '@lily/api/services/plants/helpers/assert-can-access-plant'
import { daysSince } from '@lily/shared'
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

export const plantChat = (
  plantId: string,
  messages: UIMessage[],
  imageOptions?: PlantChatImageOptions
) => {
  return Effect.gen(function* () {
    const plantRepo = yield* PlantRepository
    const careLogRepo = yield* CareLogRepository
    const scheduleRepo = yield* CareScheduleRepository
    const { id: userId } = yield* CurrentUser
    const runtime = yield* Effect.runtime<ToolContext>()

    const plant = yield* plantRepo.findById(plantId)

    if (!plant) {
      return yield* new PlantNotFoundError({ plantId })
    }

    // Verify the current user owns this plant or is an active caretaker
    yield* assertCanAccessPlant(plant.userId, plant.id)

    // Fetch care schedules for context
    const schedules = yield* scheduleRepo.findByPlant(plantId)

    // Fetch recent care logs for context
    const careLogsResponse = yield* careLogRepo.findByPlantId({
      plantId,
      limit: 10,
    })

    const careHistoryText = formatCareHistoryText(careLogsResponse.items)

    const daysSinceAdded = daysSince(plant.dateAdded)

    const systemPrompt = buildSystemPrompt({
      plant: { ...plant, schedules },
      daysSinceAdded,
      careHistoryText,
    })

    const modelMessages = yield* Effect.promise(() =>
      convertToModelMessages(messages)
    )

    // If image is provided, add it to the last user message immutably
    const lastIndex = modelMessages.length - 1
    const finalModelMessages = pipe(
      Option.fromNullable(imageOptions?.imageUrl),
      Option.flatMap((imageUrl) =>
        pipe(
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
              Array.append(
                Struct.evolve(lastMsg, { content: () => updatedContent })
              )
            ) as typeof modelMessages
          })
        )
      ),
      Option.getOrElse(() => modelMessages)
    )

    const useVisionModel = Boolean(imageOptions?.imageUrl)

    const tools = buildPlantChatTools({
      runtime,
      userId,
      plantId,
      imageKey: imageOptions?.imageKey,
      plantName: plant.name,
    })

    // Deferred that resolves with step data when streaming finishes
    const completionDeferred = yield* Deferred.make<readonly StepData[]>()

    const stream: PlantChatStreamResult = streamText({
      model: openai(useVisionModel ? CHAT_MODEL : FAST_MODEL),
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
}
