import type { PlantPermit } from '@lily/api/kernel/permit'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type {
  Conversation,
  PlantConversation,
} from '@lily/api/repositories/chat.repository'
import type { PlantWithRoom } from '@lily/api/repositories/plant.repository'
import { CHAT_MODEL, FAST_MODEL } from '@lily/api/services/ai/models'
import {
  buildGeneralSystemPrompt,
  buildPlantSystemPrompt,
  formatCareHistoryText,
  formatCarePlansText,
} from '@lily/api/services/ai-chat/build-system-prompt'
import { seesCarePlan } from '@lily/api/services/care-plans/helpers/care-plan-access'
import { actorDayTimezone } from '@lily/api/services/plants/helpers/care-context'
import {
  type Caller,
  plantKnowledgeFor,
} from '@lily/api/services/plants/helpers/with-plant-access'
import { daysSince } from '@lily/shared'
import type { CareLog } from '@lily/shared/care-log'
import { Array, DateTime, Effect, Match, pipe } from 'effect'

const CARE_HISTORY_IN_PROMPT = 10

export type ChatModel = typeof CHAT_MODEL | typeof FAST_MODEL

/** What the model is told and which model answers, for a chat about a plant. */
export interface PlantChatContext {
  readonly kind: 'plant'
  readonly systemPrompt: string
  readonly model: ChatModel
  readonly plant: PlantWithRoom
  readonly daysSinceAdded: number
  readonly careHistory: ReadonlyArray<CareLog>
  readonly timezone: string
  readonly permit: PlantPermit<'chat'>
}

/** What the model is told and which model answers, for a general chat. */
export interface GeneralChatContext {
  readonly kind: 'general'
  readonly systemPrompt: string
  readonly model: ChatModel
}

export type ChatContext = PlantChatContext | GeneralChatContext

export interface ChatTurn {
  /** The turn carries a photo, which only the vision model reads. */
  readonly withImage: boolean
}

const modelFor = (turn: ChatTurn): ChatModel =>
  turn.withImage ? CHAT_MODEL : FAST_MODEL

const plantChatContext = (
  who: Caller,
  conversation: PlantConversation,
  turn: ChatTurn
) =>
  Effect.gen(function* () {
    const careLogRepo = yield* CareLogRepository
    const scheduleRepo = yield* CareScheduleRepository
    const carePlanRepo = yield* CarePlanRepository
    const { plantId } = conversation

    const { plant, view, permit } = yield* plantKnowledgeFor(
      who,
      plantId,
      'chat'
    )

    const schedules = yield* scheduleRepo.findByPlant(plantId)
    const { items: careHistory } = yield* careLogRepo.findByPlantId({
      plantId,
      limit: CARE_HISTORY_IN_PROMPT,
    })
    const daysSinceAdded = daysSince(plant.dateAdded)

    const carePlans = Array.filter(
      yield* carePlanRepo.findByPlant(plantId),
      seesCarePlan(view)
    )
    const timezone = yield* actorDayTimezone(plant.owner, who.userId)

    const systemPrompt = buildPlantSystemPrompt({
      plant: { ...plant, schedules },
      daysSinceAdded,
      careHistoryText: formatCareHistoryText(careHistory),
      carePlansText: formatCarePlansText(carePlans, timezone),
      timezone,
      now: yield* DateTime.now,
    })

    return {
      kind: 'plant',
      systemPrompt,
      model: modelFor(turn),
      plant,
      daysSinceAdded,
      careHistory,
      timezone,
      permit,
    } satisfies PlantChatContext
  })

/**
 * The system prompt and model of the next turn of `conversation`, as `who`
 * sees the plant. The chat stream and the admin prompt preview both read it,
 * so the preview shows the prompt the model gets.
 */
export const chatContextFor = (
  who: Caller,
  conversation: Conversation,
  turn: ChatTurn
) =>
  pipe(
    Match.value(conversation),
    Match.discriminatorsExhaustive('kind')({
      plant: (plantConversation) =>
        plantChatContext(who, plantConversation, turn),
      general: () =>
        Effect.succeed<ChatContext>({
          kind: 'general',
          systemPrompt: buildGeneralSystemPrompt(),
          model: modelFor(turn),
        }),
    })
  )
